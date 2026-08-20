import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import {
  mapSettingToBoardsPricingConstants,
  mapSettingToDigitalPricingConstants,
  mapSettingToPricingConstants,
} from '../services/pricingEngineService.js';

/**
 * FEATURE-007 PE-E — everything `NewOrderPage.tsx` needs to run the same
 * pure pricing functions client-side for an instant live preview before
 * submitting. Deliberately gated on `orders.create` (not `settings.view`)
 * — reception/sales staff who create orders don't hold `settings.view`
 * (see seed.ts's SALES role), and this response carries none of the
 * business-identity/tax fields that permission is meant to protect.
 */
export async function getPricingReference(_req: Request, res: Response) {
  const [setting, families, digitalPriceTiers] = await Promise.all([
    prisma.setting.findFirstOrThrow(),
    prisma.sizeFamily.findMany({
      where: { isDeleted: false },
      include: { entries: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { label: 'asc' },
    }),
    prisma.digitalPriceTier.findMany(),
  ]);

  res.json({
    success: true,
    data: {
      pricingConstants: mapSettingToPricingConstants(setting),
      boardsConstants: mapSettingToBoardsPricingConstants(setting),
      digitalConstants: mapSettingToDigitalPricingConstants(setting),
      vatRate: setting.vatRate.toNumber(),
      sizeFamilies: families.map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        base: f.base,
        entries: f.entries.map((e) => ({
          id: e.id,
          familyId: e.familyId,
          label: e.label,
          piecesPerSheet: e.piecesPerSheet.toNumber(),
          sortOrder: e.sortOrder,
        })),
      })),
      digitalPriceTiers: digitalPriceTiers.map((t) => ({
        id: t.id,
        basis: t.basis,
        colorMode: t.colorMode,
        sides: t.sides,
        minQuantity: t.minQuantity,
        pricePerUnit: t.pricePerUnit.toNumber(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    },
  });
}
