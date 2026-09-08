import type { Request, Response } from 'express';
import { advanceLeadStageSchema, createLeadSchema, importLeadsSchema, rejectLeadSchema, updateLeadSchema } from '@cleopatra/shared';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';
import {
  advanceLeadStage,
  bulkCreateLeads,
  convertLeadToPartner,
  createLead,
  deleteLead,
  getLead,
  LeadAlreadyResolvedError,
  LeadNotFoundError,
  listLeads,
  rejectLead,
  updateLead,
} from '../services/leadService.js';
import { LeadImportParseError, parseLeadImportFile } from '../services/leadImportParser.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof LeadNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  if (err instanceof LeadAlreadyResolvedError) {
    res.status(400).json({ success: false, error: { message: err.message, code: 'LEAD_ALREADY_RESOLVED' } });
    return true;
  }
  return false;
}

export async function listLeadsHandler(_req: Request, res: Response) {
  res.json({ success: true, data: await listLeads() });
}

export async function getLeadHandler(req: Request<{ id: string }>, res: Response) {
  const lead = await getLead(req.params.id);
  if (!lead) {
    res.status(404).json({ success: false, error: { message: 'Lead not found' } });
    return;
  }
  res.json({ success: true, data: lead });
}

export async function createLeadHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createLeadSchema.parse(req.body);

  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

  const lead = await createLead(input, auth.staffId);

  await recordAudit({
    entityType: 'Lead',
    entityId: lead.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: lead.branchId,
    newValue: { name: lead.name, phone: lead.phone, source: lead.source },
  });

  res.status(201).json({ success: true, data: lead });
}

export async function updateLeadHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateLeadSchema.parse(req.body);

  try {
    const lead = await updateLead(req.params.id, input);
    await recordAudit({
      entityType: 'Lead',
      entityId: lead.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      branchId: lead.branchId,
      newValue: input,
    });
    res.json({ success: true, data: lead });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function advanceLeadStageHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = advanceLeadStageSchema.parse(req.body);

  try {
    const lead = await advanceLeadStage(req.params.id, input.stage);
    await recordAudit({
      entityType: 'Lead',
      entityId: lead.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      branchId: lead.branchId,
      newValue: { stage: lead.stage },
    });
    res.json({ success: true, data: lead });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function rejectLeadHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = rejectLeadSchema.parse(req.body);

  try {
    const lead = await rejectLead(req.params.id, input.reason);
    await recordAudit({
      entityType: 'Lead',
      entityId: lead.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      branchId: lead.branchId,
      newValue: { stage: 'REJECTED', reason: input.reason },
    });
    res.json({ success: true, data: lead });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

/**
 * Owner (2026-08-20, "زرار 'اعمله عرض سعر' من شاشة الـLead نفسها") — the
 * one and only way a Lead becomes a BusinessPartner. Returns the new
 * partner's id so the frontend can navigate straight into the normal
 * quotation composer (`/orders/new?partnerId=<id>&documentType=QUOTATION`)
 * — no separate "convert" dead-end screen.
 */
export async function convertLeadHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  let result;
  try {
    result = await convertLeadToPartner(req.params.id);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'Lead',
    entityId: result.leadId,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: result.partner.branchId,
    partnerId: result.partnerId,
    newValue: { stage: 'CONVERTED', convertedPartnerId: result.partnerId },
  });
  await recordAudit({
    entityType: 'BusinessPartner',
    entityId: result.partnerId,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: result.partner.branchId,
    partnerId: result.partnerId,
    newValue: { fromLeadId: result.leadId, status: 'PROSPECT' },
  });

  res.status(201).json({ success: true, data: result });
}

/** Step 1 of the Excel/CSV import flow — parses the uploaded file into rows only, writes nothing to the DB, so the user can review/fix rows in the UI first (see `leadImportRowSchema`'s doc comment). */
export async function parseLeadImportHandler(req: Request, res: Response) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ success: false, error: { message: 'لم يتم رفع أي ملف' } });
    return;
  }

  try {
    const rows = await parseLeadImportFile(file.buffer, file.originalname);
    res.json({ success: true, data: { rows } });
  } catch (err) {
    if (err instanceof LeadImportParseError) {
      res.status(400).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
}

/** Step 2 of the Excel/CSV import flow — the user-reviewed rows are actually created, one Lead per row, one branch/source applied to the whole batch. */
export async function importLeadsHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = importLeadsSchema.parse(req.body);

  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

  const results = await bulkCreateLeads(input.rows, input.branchId, input.source, auth.staffId);

  for (const result of results) {
    if (result.success && result.lead) {
      await recordAudit({
        entityType: 'Lead',
        entityId: result.lead.id,
        action: 'CREATE',
        performedById: auth.staffId,
        branchId: result.lead.branchId,
        newValue: { name: result.lead.name, phone: result.lead.phone, source: result.lead.source, importedRow: result.rowNumber },
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  res.status(201).json({ success: true, data: { successCount, failCount: results.length - successCount, results } });
}

export async function deleteLeadHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  try {
    await deleteLead(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'Lead',
    entityId: req.params.id,
    action: 'DELETE',
    performedById: auth.staffId,
  });

  res.json({ success: true, data: { id: req.params.id } });
}
