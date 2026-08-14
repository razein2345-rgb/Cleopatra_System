import type { Prisma } from '../generated/prisma/client.js';
import type { Department } from '@cleopatra/shared';

type DepartmentRecord = Prisma.DepartmentGetPayload<object>;

export function mapDepartmentToDto(record: DepartmentRecord): Department {
  return {
    id: record.id,
    name: record.name,
    code: record.code,
    description: record.description,
    productionTrack: record.productionTrack,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
