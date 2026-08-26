import type { Prisma } from '../generated/prisma/client.js';
import type { ItemReorderOverride } from '@cleopatra/shared';

type OverrideRecord = Prisma.ItemReorderOverrideGetPayload<object>;

/** Maps a Prisma ItemReorderOverride row onto the shared API shape. */
export function mapOverrideToDto(row: OverrideRecord): ItemReorderOverride {
  return {
    id: row.id,
    partnerId: row.partnerId,
    itemKey: row.itemKey,
    itemLabel: row.itemLabel,
    dailyConsumptionRate: row.dailyConsumptionRate,
    manualNextDate: row.manualNextDate ? row.manualNextDate.toISOString() : null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
