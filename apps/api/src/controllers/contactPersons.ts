import type { Request, Response } from 'express';
import { createContactPersonSchema, updateContactPersonSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { CONTACT_ORDER_BY, mapContactToDto } from '../services/contactPersonService.js';
import {
  ExclusiveDefaultConflictError,
  canBeDefault,
  loadPartnerOr404,
  setExclusiveDefault,
} from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';

async function loadContactOr404(partnerId: string, contactId: string, res: Response) {
  const contact = await prisma.contactPerson.findUnique({ where: { id: contactId } });
  if (!contact || contact.isDeleted || contact.partnerId !== partnerId) {
    res.status(404).json({ success: false, error: { message: 'Contact person not found' } });
    return null;
  }
  return contact;
}

export async function listContactPersons(req: Request<{ partnerId: string }>, res: Response) {
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;

  const contacts = await prisma.contactPerson.findMany({
    where: { partnerId: partner.id, isDeleted: false },
    orderBy: CONTACT_ORDER_BY,
  });
  res.json({ success: true, data: contacts.map(mapContactToDto) });
}

export async function createContactPerson(req: Request<{ partnerId: string }>, res: Response) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }

  const input = createContactPersonSchema.parse(req.body);
  const contact = await prisma.contactPerson.create({
    data: { ...input, partnerId: partner.id },
  });

  await recordAudit({
    entityType: 'ContactPerson',
    entityId: contact.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    newValue: { partnerId: partner.id, ...input },
  });

  res.status(201).json({ success: true, data: mapContactToDto(contact) });
}

export async function updateContactPerson(
  req: Request<{ partnerId: string; contactId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }
  const existing = await loadContactOr404(partner.id, req.params.contactId, res);
  if (!existing) return;

  const input = updateContactPersonSchema.parse(req.body);

  // Business rule (M2): an inactive contact can never be primary — if this
  // update deactivates a contact that currently is primary, clear that
  // flag in the same write rather than leaving an invalid combination.
  const clearingPrimaryOnDeactivate = input.isActive === false && existing.isPrimary;

  const updated = await prisma.contactPerson.update({
    where: { id: existing.id },
    data: { ...input, ...(clearingPrimaryOnDeactivate ? { isPrimary: false } : {}) },
  });

  const statusChanged = input.isActive !== undefined && input.isActive !== existing.isActive;

  await recordAudit({
    entityType: 'ContactPerson',
    entityId: updated.id,
    action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: {
      fullName: existing.fullName,
      jobTitle: existing.jobTitle,
      department: existing.department,
      mobile: existing.mobile,
      phone: existing.phone,
      whatsapp: existing.whatsapp,
      email: existing.email,
      preferredContactMethod: existing.preferredContactMethod,
      canApproveQuotations: existing.canApproveQuotations,
      canApproveWorkOrders: existing.canApproveWorkOrders,
      canApproveFinancialDocuments: existing.canApproveFinancialDocuments,
      notes: existing.notes,
      isActive: existing.isActive,
      isPrimary: existing.isPrimary,
    },
    newValue: clearingPrimaryOnDeactivate
      ? { ...input, isPrimary: false, note: 'primary cleared automatically on deactivation' }
      : input,
  });

  res.json({ success: true, data: mapContactToDto(updated) });
}

/**
 * Only entry point that may set isPrimary — atomically unsets any other
 * primary contact for the same partner (00_REQUIREMENTS.md / the M2 "only
 * one Primary Contact" rule) and rejects inactive targets. Concurrency
 * safety and the DB backstop are provided by the shared
 * `setExclusiveDefault` helper (see `partnerChildEntity.ts` and
 * PROJECT_MEMORY.md's "Exactly one flagged row per group" decision).
 */
export async function setPrimaryContactPerson(
  req: Request<{ partnerId: string; contactId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }
  const existing = await loadContactOr404(partner.id, req.params.contactId, res);
  if (!existing) return;

  if (!canBeDefault(existing)) {
    res.status(400).json({
      success: false,
      error: {
        message: 'An inactive contact cannot be set as the primary contact',
        code: 'INACTIVE_CANNOT_BE_PRIMARY',
      },
    });
    return;
  }

  if (existing.isPrimary) {
    res.json({ success: true, data: mapContactToDto(existing) });
    return;
  }

  let updated;
  try {
    updated = await setExclusiveDefault({
      partnerId: partner.id,
      unsetOthers: (tx) =>
        tx.contactPerson.updateMany({
          where: { partnerId: partner.id, isPrimary: true },
          data: { isPrimary: false },
        }),
      setTarget: (tx) =>
        tx.contactPerson.update({ where: { id: existing.id }, data: { isPrimary: true } }),
    });
  } catch (err) {
    if (err instanceof ExclusiveDefaultConflictError) {
      res.status(409).json({
        success: false,
        error: {
          message: 'Another request already changed the primary contact — please retry',
          code: 'PRIMARY_CONTACT_CONFLICT',
        },
      });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'ContactPerson',
    entityId: updated.id,
    action: 'PRIMARY_CHANGED',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: { isPrimary: false },
    newValue: { isPrimary: true },
  });

  res.json({ success: true, data: mapContactToDto(updated) });
}

/** Soft delete only (ADR 0007) — never remove a contact's history outright. */
export async function deleteContactPerson(
  req: Request<{ partnerId: string; contactId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }
  const existing = await loadContactOr404(partner.id, req.params.contactId, res);
  if (!existing) return;

  const deleted = await prisma.contactPerson.update({
    where: { id: existing.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: auth.staffId,
      // A deleted contact cannot remain the primary contact.
      isPrimary: false,
    },
    select: { id: true },
  });

  await recordAudit({
    entityType: 'ContactPerson',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
