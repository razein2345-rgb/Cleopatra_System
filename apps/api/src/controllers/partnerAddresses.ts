import type { Request, Response } from 'express';
import { createPartnerAddressSchema, updatePartnerAddressSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { ADDRESS_ORDER_BY, mapAddressToDto } from '../services/partnerAddressService.js';
import {
  ExclusiveDefaultConflictError,
  canBeDefault,
  loadPartnerOr404,
  setExclusiveDefault,
} from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';

async function loadAddressOr404(partnerId: string, addressId: string, res: Response) {
  const address = await prisma.partnerAddress.findUnique({ where: { id: addressId } });
  if (!address || address.isDeleted || address.partnerId !== partnerId) {
    res.status(404).json({ success: false, error: { message: 'Address not found' } });
    return null;
  }
  return address;
}

export async function listPartnerAddresses(req: Request<{ partnerId: string }>, res: Response) {
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;

  const addresses = await prisma.partnerAddress.findMany({
    where: { partnerId: partner.id, isDeleted: false },
    orderBy: ADDRESS_ORDER_BY,
  });
  res.json({ success: true, data: addresses.map(mapAddressToDto) });
}

export async function createPartnerAddress(req: Request<{ partnerId: string }>, res: Response) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }

  const input = createPartnerAddressSchema.parse(req.body);
  const address = await prisma.partnerAddress.create({
    data: { ...input, partnerId: partner.id },
  });

  await recordAudit({
    entityType: 'PartnerAddress',
    entityId: address.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    newValue: { partnerId: partner.id, ...input },
  });

  res.status(201).json({ success: true, data: mapAddressToDto(address) });
}

export async function updatePartnerAddress(
  req: Request<{ partnerId: string; addressId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }
  const existing = await loadAddressOr404(partner.id, req.params.addressId, res);
  if (!existing) return;

  const input = updatePartnerAddressSchema.parse(req.body);

  // Business rule (M3): an inactive address can never be the default — if
  // this update deactivates an address that currently is default, clear
  // that flag in the same write rather than leaving an invalid combination.
  const clearingDefaultOnDeactivate = input.isActive === false && existing.isDefault;

  const updated = await prisma.partnerAddress.update({
    where: { id: existing.id },
    data: { ...input, ...(clearingDefaultOnDeactivate ? { isDefault: false } : {}) },
  });

  const statusChanged = input.isActive !== undefined && input.isActive !== existing.isActive;

  await recordAudit({
    entityType: 'PartnerAddress',
    entityId: updated.id,
    action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: {
      name: existing.name,
      type: existing.type,
      country: existing.country,
      governorate: existing.governorate,
      city: existing.city,
      district: existing.district,
      street: existing.street,
      building: existing.building,
      floor: existing.floor,
      apartment: existing.apartment,
      postalCode: existing.postalCode,
      googleMapsUrl: existing.googleMapsUrl,
      latitude: existing.latitude,
      longitude: existing.longitude,
      notes: existing.notes,
      isActive: existing.isActive,
      isDefault: existing.isDefault,
    },
    newValue: clearingDefaultOnDeactivate
      ? { ...input, isDefault: false, note: 'default cleared automatically on deactivation' }
      : input,
  });

  res.json({ success: true, data: mapAddressToDto(updated) });
}

/**
 * Only entry point that may set isDefault — atomically unsets any other
 * default address of the same type for the same partner and rejects
 * inactive targets. Concurrency safety and the DB backstop are provided
 * by the shared `setExclusiveDefault` helper (see `partnerChildEntity.ts`
 * and PROJECT_MEMORY.md's "Exactly one flagged row per group" decision) —
 * the same helper used by `setPrimaryContactPerson`.
 */
export async function setDefaultPartnerAddress(
  req: Request<{ partnerId: string; addressId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }
  const existing = await loadAddressOr404(partner.id, req.params.addressId, res);
  if (!existing) return;

  if (!canBeDefault(existing)) {
    res.status(400).json({
      success: false,
      error: {
        message: 'An inactive address cannot be set as the default',
        code: 'INACTIVE_CANNOT_BE_DEFAULT',
      },
    });
    return;
  }

  if (existing.isDefault) {
    res.json({ success: true, data: mapAddressToDto(existing) });
    return;
  }

  let updated;
  try {
    updated = await setExclusiveDefault({
      partnerId: partner.id,
      unsetOthers: (tx) =>
        tx.partnerAddress.updateMany({
          where: { partnerId: partner.id, type: existing.type, isDefault: true },
          data: { isDefault: false },
        }),
      setTarget: (tx) =>
        tx.partnerAddress.update({ where: { id: existing.id }, data: { isDefault: true } }),
    });
  } catch (err) {
    if (err instanceof ExclusiveDefaultConflictError) {
      res.status(409).json({
        success: false,
        error: {
          message: 'Another request already changed the default address — please retry',
          code: 'DEFAULT_ADDRESS_CONFLICT',
        },
      });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'PartnerAddress',
    entityId: updated.id,
    action: 'DEFAULT_CHANGED',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: { isDefault: false },
    newValue: { isDefault: true },
  });

  res.json({ success: true, data: mapAddressToDto(updated) });
}

/** Soft delete only (ADR 0007) — never remove an address's history outright. */
export async function deletePartnerAddress(
  req: Request<{ partnerId: string; addressId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }
  const existing = await loadAddressOr404(partner.id, req.params.addressId, res);
  if (!existing) return;

  const deleted = await prisma.partnerAddress.update({
    where: { id: existing.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: auth.staffId,
      // A deleted address cannot remain the default address for its type.
      isDefault: false,
    },
    select: { id: true },
  });

  await recordAudit({
    entityType: 'PartnerAddress',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
