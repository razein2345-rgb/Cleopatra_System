import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PartnerTag } from '@cleopatra/shared';

type TagRecord = Prisma.PartnerTagGetPayload<object>;

/** Maps a Prisma PartnerTag row onto the shared PartnerTag API shape. */
export function mapTagToDto(tag: TagRecord): PartnerTag {
  return {
    id: tag.id,
    name: tag.name,
    isActive: tag.isActive,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}

/** Business rule (M4): a tag currently assigned to any active partner cannot be deleted. */
export async function isTagInUse(tagId: string): Promise<boolean> {
  const count = await prisma.businessPartnerTag.count({
    where: { tagId, partner: { isDeleted: false } },
  });
  return count > 0;
}
