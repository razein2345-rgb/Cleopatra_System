import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PartnerCategory } from '@cleopatra/shared';

type CategoryRecord = Prisma.PartnerCategoryGetPayload<object>;

/** Maps a Prisma PartnerCategory row onto the shared PartnerCategory API shape. */
export function mapCategoryToDto(category: CategoryRecord): PartnerCategory {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

/** Business rule (M4): a category currently assigned to any active partner cannot be deleted. */
export async function isCategoryInUse(categoryId: string): Promise<boolean> {
  const count = await prisma.businessPartner.count({
    where: { categoryId, isDeleted: false },
  });
  return count > 0;
}
