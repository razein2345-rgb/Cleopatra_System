import type { Request, Response } from 'express';
import { upsertPartnerCommercialProfileSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { mapCommercialProfileToDto } from '../services/partnerCommercialProfileService.js';
import { loadPartnerOr404 } from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';

/**
 * Returns `null` (not 404) when no profile has been created yet — a fresh
 * partner having no Commercial Profile is a normal state, not an error
 * (mirrors `getBusinessPartnerDto`'s 404-only-when-the-partner-itself-is-
 * missing shape, one level down).
 */
export async function getPartnerCommercialProfile(
  req: Request<{ partnerId: string }>,
  res: Response,
) {
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;

  const profile = await prisma.partnerCommercialProfile.findUnique({
    where: { partnerId: partner.id },
  });

  res.json({ success: true, data: profile ? mapCommercialProfileToDto(profile) : null });
}

/**
 * Only entry point that may create or change a partner's Commercial
 * Profile — a single upsert, not separate create/update endpoints, since
 * this is a 1:1 detail record (see schema.prisma's model comment). Every
 * write is heightened-standard audit-logged with before/after values, per
 * 02_PLAN.md/03_IMPLEMENT.md's explicit M6 requirement.
 */
export async function upsertPartnerCommercialProfile(
  req: Request<{ partnerId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;

  const input = upsertPartnerCommercialProfileSchema.parse(req.body);

  const existing = await prisma.partnerCommercialProfile.findUnique({
    where: { partnerId: partner.id },
  });

  if (!existing) {
    const created = await prisma.partnerCommercialProfile.create({
      data: { ...input, partnerId: partner.id },
    });

    await recordAudit({
      entityType: 'PartnerCommercialProfile',
      entityId: created.id,
      action: 'CREATE',
      performedById: auth.staffId,
      branchId: partner.branchId,
      partnerId: partner.id,
      newValue: input,
    });

    res.status(201).json({ success: true, data: mapCommercialProfileToDto(created) });
    return;
  }

  const updated = await prisma.partnerCommercialProfile.update({
    where: { id: existing.id },
    data: input,
  });

  const statusChanged = input.status !== undefined && input.status !== existing.status;

  await recordAudit({
    entityType: 'PartnerCommercialProfile',
    entityId: updated.id,
    action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: {
      creditLimit: existing.creditLimit,
      paymentTermsDays: existing.paymentTermsDays,
      preferredPaymentMethod: existing.preferredPaymentMethod,
      priceTier: existing.priceTier,
      status: existing.status,
      riskLevel: existing.riskLevel,
      preferredCurrency: existing.preferredCurrency,
      internalNotes: existing.internalNotes,
    },
    newValue: input,
  });

  res.json({ success: true, data: mapCommercialProfileToDto(updated) });
}
