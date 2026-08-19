import type { Prisma } from '../generated/prisma/client.js';
import type { ExtraServiceOption } from '@cleopatra/shared';

type ExtraServiceOptionRecord = Prisma.ExtraServiceOptionGetPayload<object>;

export function mapExtraServiceOptionToDto(option: ExtraServiceOptionRecord): ExtraServiceOption {
  return {
    id: option.id,
    label: option.label,
    isActive: option.isActive,
    sortOrder: option.sortOrder,
    applicableTracks: option.applicableTracks,
    createdAt: option.createdAt.toISOString(),
    updatedAt: option.updatedAt.toISOString(),
  };
}
