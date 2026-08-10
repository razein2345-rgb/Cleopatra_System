import type { Request, Response } from 'express';
import {
  createDocumentTemplateSchema,
  documentTypeSchema,
  updateDocumentTemplateSchema,
} from '@cleopatra/shared';
import { z } from 'zod';
import {
  createDocumentTemplate,
  createTemplateVersion,
  deleteDocumentTemplate,
  DocumentTemplateNotFoundError,
  duplicateDocumentTemplate,
  getDocumentTemplate,
  listDocumentTemplates,
  publishDocumentTemplate,
  setDefaultDocumentTemplate,
  TemplateAlreadyPublishedError,
  TemplateInUseError,
  TemplateNotPublishedError,
  updateDocumentTemplate,
} from '../services/documentTemplateService.js';
import { ExclusiveDefaultConflictError } from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof DocumentTemplateNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  if (err instanceof TemplateAlreadyPublishedError) {
    res.status(400).json({ success: false, error: { message: err.message, code: 'TEMPLATE_ALREADY_PUBLISHED' } });
    return true;
  }
  if (err instanceof TemplateNotPublishedError) {
    res.status(400).json({ success: false, error: { message: err.message, code: 'TEMPLATE_NOT_PUBLISHED' } });
    return true;
  }
  if (err instanceof TemplateInUseError) {
    res.status(409).json({ success: false, error: { message: err.message, code: 'TEMPLATE_IN_USE' } });
    return true;
  }
  if (err instanceof ExclusiveDefaultConflictError) {
    res.status(409).json({ success: false, error: { message: err.message, code: 'DEFAULT_TEMPLATE_CONFLICT' } });
    return true;
  }
  return false;
}

export async function listDocumentTemplatesHandler(req: Request, res: Response) {
  const typeParam = typeof req.query.documentType === 'string' ? req.query.documentType : undefined;
  const typeResult = typeParam ? documentTypeSchema.safeParse(typeParam) : undefined;
  const templates = await listDocumentTemplates(typeResult?.success ? typeResult.data : undefined);
  res.json({ success: true, data: templates });
}

export async function getDocumentTemplateHandler(req: Request<{ id: string }>, res: Response) {
  const template = await getDocumentTemplate(req.params.id);
  if (!template) {
    res.status(404).json({ success: false, error: { message: 'Document template not found' } });
    return;
  }
  res.json({ success: true, data: template });
}

export async function createDocumentTemplateHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createDocumentTemplateSchema.parse(req.body);
  const created = await createDocumentTemplate(input);

  await recordAudit({
    entityType: 'DocumentTemplate',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    newValue: { documentType: created.documentType, name: created.name },
  });

  res.status(201).json({ success: true, data: created });
}

const duplicateSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function duplicateDocumentTemplateHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = duplicateSchema.parse(req.body);

  let duplicated;
  try {
    duplicated = await duplicateDocumentTemplate(req.params.id, input.name);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'DocumentTemplate',
    entityId: duplicated.id,
    action: 'CREATE',
    performedById: auth.staffId,
    newValue: { documentType: duplicated.documentType, name: duplicated.name, duplicatedFrom: req.params.id },
  });

  res.status(201).json({ success: true, data: duplicated });
}

export async function updateDocumentTemplateHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateDocumentTemplateSchema.parse(req.body);

  let updated;
  try {
    updated = await updateDocumentTemplate(req.params.id, input);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'DocumentTemplate',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    newValue: input,
  });

  res.json({ success: true, data: updated });
}

export async function createTemplateVersionHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  let created;
  try {
    created = await createTemplateVersion(req.params.id);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'DocumentTemplate',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    newValue: { documentType: created.documentType, version: created.version, previousVersionId: created.previousVersionId },
  });

  res.status(201).json({ success: true, data: created });
}

export async function publishDocumentTemplateHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  let published;
  try {
    published = await publishDocumentTemplate(req.params.id);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'DocumentTemplate',
    entityId: published.id,
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    newValue: { publishedAt: published.publishedAt },
  });

  res.json({ success: true, data: published });
}

export async function setDefaultDocumentTemplateHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  let updated;
  try {
    updated = await setDefaultDocumentTemplate(req.params.id);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'DocumentTemplate',
    entityId: updated.id,
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    newValue: { isDefault: true },
  });

  res.json({ success: true, data: updated });
}

export async function deleteDocumentTemplateHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  try {
    await deleteDocumentTemplate(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'DocumentTemplate',
    entityId: req.params.id,
    action: 'DELETE',
    performedById: auth.staffId,
  });

  res.json({ success: true, data: { id: req.params.id } });
}
