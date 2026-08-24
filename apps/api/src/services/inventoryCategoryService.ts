import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { InventoryCategory } from '@cleopatra/shared';

type CategoryRecord = Prisma.InventoryCategoryGetPayload<object>;

/** Maps a Prisma InventoryCategory row onto the shared InventoryCategory API shape — mirrors `partnerCategoryService.ts` exactly. */
export function mapCategoryToDto(category: CategoryRecord): InventoryCategory {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

/** A category currently assigned to any active inventory item cannot be deleted — same rule as PartnerCategory. */
export async function isCategoryInUse(categoryId: string): Promise<boolean> {
  const count = await prisma.inventoryItem.count({
    where: { categoryId, isDeleted: false },
  });
  return count > 0;
}
