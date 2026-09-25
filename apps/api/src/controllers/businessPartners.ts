import type { Request, Response } from 'express';
import { createBusinessPartnerSchema, normalizePhoneKey, updateBusinessPartnerSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  getBusinessPartnerDto,
  hasValidContactMethod,
  mapPartnerToDto,
} from '../services/businessPartnerService.js';
import { recordAudit } from '../services/auditService.js';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { assertNoDuplicatePhone, DuplicatePhoneError } from '../services/leadService.js';
import { sendDuplicatePhone } from './duplicatePhone.js';

/** `lastContactedAt`/`nextFollowUpAt` arrive as ISO strings (Zod's date convention throughout this codebase) but Prisma's DateTime columns need real `Date`s — same explicit-conversion pattern `orderService.ts`'s `deliveryDate` handling already uses, not implicit string coercion. */
function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

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
  const { allowDuplicate, ...input } = createBusinessPartnerSchema.parse(req.body);

  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

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

  // Duplicate detection by phone (owner decision, 2026-09-25): a customer whose number already belongs
  // to a customer or an open lead is refused unless the user saw it and chose to go on. Suppliers
  // (created with only the SUPPLIER role) are a different list and are not checked here.
  const supplierOnly = input.roles !== undefined && input.roles.length > 0 && !input.roles.includes('CUSTOMER');
  if (input.phone && !allowDuplicate && !supplierOnly) {
    try {
      await assertNoDuplicatePhone(input.phone, { includeLeads: true });
    } catch (err) {
      if (err instanceof DuplicatePhoneError) {
        sendDuplicatePhone(err, auth, res);
        return;
      }
      throw err;
    }
  }

  const partner = await prisma.businessPartner.create({
    data: {
      ...input,
      lastContactedAt: toDate(input.lastContactedAt),
      nextFollowUpAt: toDate(input.nextFollowUpAt),
    },
  });

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
  const { allowDuplicate, ...input } = updateBusinessPartnerSchema.parse(req.body);

  const existing = await prisma.businessPartner.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Business partner not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId) || (input.branchId && !canAccessBranch(auth, input.branchId))) {
    forbidBranch(res);
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

  // Changing the number to one that already belongs to a customer or an open lead is refused unless the
  // user saw it and chose to go on (same rule as creating a customer). Only an actual CHANGE is checked -
  // re-typing the same number in another format, or editing anything else, never trips it - and a
  // supplier-only partner is a different list.
  const effectiveRoles = input.roles ?? existing.roles;
  const supplierOnly = effectiveRoles.length > 0 && !effectiveRoles.includes('CUSTOMER');
  if (input.phone && !allowDuplicate && !supplierOnly && normalizePhoneKey(input.phone) !== normalizePhoneKey(existing.phone ?? '')) {
    try {
      await assertNoDuplicatePhone(input.phone, { includeLeads: true, excludePartnerId: existing.id });
    } catch (err) {
      if (err instanceof DuplicatePhoneError) {
        sendDuplicatePhone(err, auth, res);
        return;
      }
      throw err;
    }
  }

  // General update never touches category/tags (see businessPartner.ts's
  // schema comment — those are read-only here, changed only via the
  // dedicated PUT .../category / PUT .../tags endpoints), but the response
  // DTO must still report the partner's *current* tagIds accurately.
  const updated = await prisma.businessPartner.update({
    where: { id: req.params.id },
    data: {
      ...input,
      lastContactedAt: toDate(input.lastContactedAt),
      nextFollowUpAt: toDate(input.nextFollowUpAt),
    },
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
    select: { isDeleted: true, branchId: true },
  });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Business partner not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }

  // Owner decision (2026-09-25) - a customer with live invoices or quotations
  // cannot be deleted (a hard block, not a warning): deleting one orphaned its
  // invoices (they dropped out of the customer-grouped lists and the invoice
  // page could not even load), and the customer may still owe money. Only
  // non-deleted documents count. To hide a customer with history, an
  // archive/inactive state is the right tool - a separate, larger change.
  const [invoiceCount, quotationCount] = await Promise.all([
    prisma.order.count({ where: { partnerId: req.params.id, isDeleted: false } }),
    prisma.quotation.count({ where: { partnerId: req.params.id, isDeleted: false } }),
  ]);
  if (invoiceCount + quotationCount > 0) {
    const parts = [
      ...(invoiceCount > 0 ? [`${invoiceCount} فاتورة`] : []),
      ...(quotationCount > 0 ? [`${quotationCount} عرض سعر`] : []),
    ];
    res.status(409).json({
      success: false,
      error: {
        message: `لا يمكن حذف هذا العميل — له ${parts.join(' و')} غير محذوفة. احذفها أولًا، أو احتفظ بالعميل.`,
        code: 'PARTNER_HAS_DOCUMENTS',
        invoiceCount,
        quotationCount,
      },
    });
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
