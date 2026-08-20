import type { Request, Response } from 'express';
import { createDigitalPriceTierSchema, updateDigitalPriceTierSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { mapDigitalPriceTierToDto } from '../services/digitalPriceTierService.js';
import { recordAudit } from '../services/auditService.js';

async function loadTierOr404(id: string, res: Response) {
  const tier = await prisma.digitalPriceTier.findUnique({ where: { id } });
  if (!tier) {
    res.status(404).json({ success: false, error: { message: 'Digital price tier not found' } });
    return null;
  }
  return tier;
}

/** Owner (2026-08-20) — every tier across all 12 (basis, colorMode, sides) tables; the settings screen groups them client-side (small dataset, no pagination needed). */
export async function listDigitalPriceTiers(_req: Request, res: Response) {
  const tiers = await prisma.digitalPriceTier.findMany({
    orderBy: [{ basis: 'asc' }, { colorMode: 'asc' }, { sides: 'asc' }, { minQuantity: 'asc' }],
  });
  res.json({ success: true, data: tiers.map(mapDigitalPriceTierToDto) });
}

export async function createDigitalPriceTier(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createDigitalPriceTierSchema.parse(req.body);

  let tier;
  try {
    tier = await prisma.digitalPriceTier.create({ data: input });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      res.status(409).json({
        success: false,
        error: { message: 'يوجد بالفعل شريحة بنفس الكمية الأدنى لهذا الجدول', code: 'DUPLICATE_TIER' },
      });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'DigitalPriceTier',
    entityId: tier.id,
    action: 'CREATE',
    performedById: auth.staffId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: mapDigitalPriceTierToDto(tier) });
}

export async function updateDigitalPriceTier(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadTierOr404(req.params.id, res);
  if (!existing) return;

  const input = updateDigitalPriceTierSchema.parse(req.body);

  let updated;
  try {
    updated = await prisma.digitalPriceTier.update({ where: { id: existing.id }, data: input });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      res.status(409).json({
        success: false,
        error: { message: 'يوجد بالفعل شريحة بنفس الكمية الأدنى لهذا الجدول', code: 'DUPLICATE_TIER' },
      });
      return;
    }
    throw err;
  }

  await recordAudit({
    entityType: 'DigitalPriceTier',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    previousValue: { minQuantity: existing.minQuantity, pricePerUnit: existing.pricePerUnit.toNumber() },
    newValue: input,
  });

  res.json({ success: true, data: mapDigitalPriceTierToDto(updated) });
}

/** Hard delete — this is a plain admin-managed price list, not an audited business record with history to preserve (unlike TreasuryEntry/OrderTemplate/etc.), so ADR 0007's soft-delete convention doesn't apply here. */
export async function deleteDigitalPriceTier(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadTierOr404(req.params.id, res);
  if (!existing) return;

  await prisma.digitalPriceTier.delete({ where: { id: existing.id } });

  await recordAudit({
    entityType: 'DigitalPriceTier',
    entityId: existing.id,
    action: 'DELETE',
    performedById: auth.staffId,
    previousValue: { basis: existing.basis, colorMode: existing.colorMode, sides: existing.sides, minQuantity: existing.minQuantity },
  });

  res.json({ success: true, data: { id: existing.id } });
}
