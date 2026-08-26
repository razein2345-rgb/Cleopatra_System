import type { Request, Response } from 'express';
import { upsertItemReorderOverrideSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { mapOverrideToDto } from '../services/itemReorderOverrideService.js';
import { loadPartnerOr404 } from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';

/** All overrides for one partner — small list, the frontend matches them onto its own client-side item groups by `itemKey`. */
export async function listItemReorderOverrides(req: Request<{ partnerId: string }>, res: Response) {
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;

  const overrides = await prisma.itemReorderOverride.findMany({
    where: { partnerId: partner.id },
  });
  res.json({ success: true, data: overrides.map(mapOverrideToDto) });
}

/**
 * Every override, across every partner — powers the dashboard's
 * cross-customer "عملاء قرّب ميعاد إعادة الطلب المتوقع بتاعهم" widget
 * (`ReorderDueWidget.tsx`), which otherwise has no way to know which
 * customers have a manual override without an N+1 fetch per partner.
 */
export async function listAllItemReorderOverrides(_req: Request, res: Response) {
  const overrides = await prisma.itemReorderOverride.findMany();
  res.json({ success: true, data: overrides.map(mapOverrideToDto) });
}

/** Upsert — one row per (partnerId, itemKey), matching the unique index. */
export async function upsertItemReorderOverride(
  req: Request<{ partnerId: string; itemKey: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }

  const input = upsertItemReorderOverrideSchema.parse(req.body);
  const itemKey = req.params.itemKey;

  const existing = await prisma.itemReorderOverride.findUnique({
    where: { partnerId_itemKey: { partnerId: partner.id, itemKey } },
  });

  const data = {
    itemLabel: input.itemLabel,
    dailyConsumptionRate: input.dailyConsumptionRate ?? null,
    manualNextDate: input.manualNextDate ? new Date(input.manualNextDate) : null,
  };

  const saved = existing
    ? await prisma.itemReorderOverride.update({
        where: { id: existing.id },
        data: { ...data, updatedBy: auth.staffId },
      })
    : await prisma.itemReorderOverride.create({
        data: { ...data, partnerId: partner.id, itemKey, createdBy: auth.staffId },
      });

  await recordAudit({
    entityType: 'ItemReorderOverride',
    entityId: saved.id,
    action: existing ? 'UPDATE' : 'CREATE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: existing
      ? { dailyConsumptionRate: existing.dailyConsumptionRate, manualNextDate: existing.manualNextDate }
      : undefined,
    newValue: data,
  });

  res.json({ success: true, data: mapOverrideToDto(saved) });
}

/** Clears a manual override — the item goes back to the plain auto average-gap estimate. */
export async function deleteItemReorderOverride(
  req: Request<{ partnerId: string; itemKey: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }

  const existing = await prisma.itemReorderOverride.findUnique({
    where: { partnerId_itemKey: { partnerId: partner.id, itemKey: req.params.itemKey } },
  });
  if (!existing) {
    res.status(404).json({ success: false, error: { message: 'Override not found' } });
    return;
  }

  await prisma.itemReorderOverride.delete({ where: { id: existing.id } });

  await recordAudit({
    entityType: 'ItemReorderOverride',
    entityId: existing.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: {
      dailyConsumptionRate: existing.dailyConsumptionRate,
      manualNextDate: existing.manualNextDate,
    },
  });

  res.json({ success: true, data: { id: existing.id } });
}
