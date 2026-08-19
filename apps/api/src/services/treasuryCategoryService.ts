import type { Prisma } from '../generated/prisma/client.js';
import type { TreasuryCategory } from '@cleopatra/shared';

type TreasuryCategoryRecord = Prisma.TreasuryCategoryGetPayload<object>;

/** Maps a Prisma TreasuryCategory row onto the shared TreasuryCategory API shape. */
export function mapTreasuryCategoryToDto(category: TreasuryCategoryRecord): TreasuryCategory {
  return {
    id: category.id,
    name: category.name,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
