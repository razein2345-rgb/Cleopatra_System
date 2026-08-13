import type { Request, Response } from 'express';
import { createBusinessPartnerSchema, updateBusinessPartnerSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  getBusinessPartnerDto,
  hasValidContactMethod,
  mapPartnerToDto,
} from '../services/businessPartnerService.js';
import { recordAudit } from '../services/auditService.js';

/**
 * Milestone 1 (Core Partner Record) only — no search/filtering beyond
 * ordering (that's FEATURE-002 Milestone 9), no contacts/addresses/credit/
 * tax/documents (later milestones). See
 * docs/AI/FEATURES/FEATURE-002-CUSTOMERS/03_IMPLEMENT.md.
 */
export async function listBusinessPartners(_req: Request, res: Response) {
  // `tags` is included as a light `{ tagId }`-only join — Prisma batches
  // this as one extra `WHERE partnerId IN (...)` query, not per-row N+1 —
  // needed because `tagIds` is now a required field on the shared
  // BusinessPartner DTO (see businessPartnerService.ts's mapPartnerToDto).
  const partners = await prisma.businessPartner.findMany({
    where: { isDeleted: false },
    orderBy: { nameAr: 'asc' },
    include: { tags: { select: { tagId: true } } },
  });
  res.json({
    success: true,
    data: partners.map((p) =>
      mapPartnerToDto(
        p,
        p.tags.map((t) => t.tagId),
      ),
    ),
  });
}

export async function getBusinessPartner(req: Request<{ id: string }>, res: Response) {
  const partner = await getBusinessPartnerDto(req.params.id);
  if (!partner) {
    res.status(404).json({ success: false, error: { message: 'Business partner not found' } });
    return;
  }
  res.json({ success: true, data: partner });
}

export async function createBusinessPartner(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createBusinessPartnerSchema.parse(req.body);

  if (input.status === 'ACTIVE' && !hasValidContactMethod(input)) {
    res.status(400).json({
      success: false,
      error: {
        message: 'A business partner cannot be marked Active without a phone or email on file',
        code: 'MISSING_CONTACT_METHOD',
      },
    });
    return;
  }

  const partner = await prisma.businessPartner.create({ data: input });

  await recordAudit({
    entityType: 'BusinessPartner',
    entityId: partner.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    newValue: input,
  });

  // A brand-new partner genuinely has zero tags — no query needed, `[]` is
  // accurate here (unlike a list/update response, where it would have to
  // be fetched to be correct).
  res.status(201).json({ success: true, data: mapPartnerToDto(partner, []) });
}

export async function updateBusinessPartner(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateBusinessPartnerSchema.parse(req.body);

  const existing = await prisma.businessPartner.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Business partner not found' } });
    return;
  }

  const effectiveStatus = input.status ?? existing.status;
  const effectiveContact = {
    phone: input.phone !== undefined ? input.phone : existing.phone,
    email: input.email !== undefined ? input.email : existing.email,
  };
  if (effectiveStatus === 'ACTIVE' && !hasValidContactMethod(effectiveContact)) {
    res.status(400).json({
      success: false,
      error: {
        message: 'A business partner cannot be marked Active without a phone or email on file',
        code: 'MISSING_CONTACT_METHOD',
      },
    });
    return;
  }

  // General update never touches category/tags (see businessPartner.ts's
  // schema comment — those are read-only here, changed only via the
  // dedicated PUT .../category / PUT .../tags endpoints), but the response
  // DTO must still report the partner's *current* tagIds accurately.
  const updated = await prisma.businessPartner.update({
    where: { id: req.params.id },
    data: input,
    include: { tags: { select: { tagId: true } } },
  });

  const statusChanged = input.status !== undefined && input.status !== existing.status;

  await recordAudit({
    entityType: 'BusinessPartner',
    entityId: updated.id,
    action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
    performedById: auth.staffId,
    branchId: updated.branchId,
    partnerId: updated.id,
    previousValue: {
      nameAr: existing.nameAr,
      nameEn: existing.nameEn,
      shortName: existing.shortName,
      isIndividual: existing.isIndividual,
      gender: existing.gender,
      roles: existing.roles,
      status: existing.status,
      branchId: existing.branchId,
      salesRepId: existing.salesRepId,
      phone: existing.phone,
      email: existing.email,
      notes: existing.notes,
    },
    newValue: input,
  });

  res.json({
    success: true,
    data: mapPartnerToDto(
      updated,
      updated.tags.map((t) => t.tagId),
    ),
  });
}

/** Soft delete only (ADR 0007) — a partner with any transaction history must never be hard-deleted. */
export async function deleteBusinessPartner(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  // Query performance: only `isDeleted` is actually inspected below — no
  // need to fetch the rest of the row for an existence/state check.
  const existing = await prisma.businessPartner.findUnique({
    where: { id: req.params.id },
    select: { isDeleted: true },
  });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Business partner not found' } });
    return;
  }

  const deleted = await prisma.businessPartner.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
    select: { id: true, branchId: true },
  });

  await recordAudit({
    entityType: 'BusinessPartner',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: deleted.branchId,
    partnerId: deleted.id,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
