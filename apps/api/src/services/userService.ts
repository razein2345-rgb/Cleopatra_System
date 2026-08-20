import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { User } from '@cleopatra/shared';

export const userInclude = {
  roles: { include: { role: true } },
  branchAccess: true,
} satisfies Prisma.StaffProfileInclude;

type StaffWithRoles = Prisma.StaffProfileGetPayload<{ include: typeof userInclude }>;

/** Maps a Prisma StaffProfile (with roles/branchAccess included) onto the shared `User` API shape. */
export function mapStaffToUser(staff: StaffWithRoles): User {
  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    phone: staff.phone,
    isActive: staff.isActive,
    lastLoginAt: staff.lastLoginAt ? staff.lastLoginAt.toISOString() : null,
    lastActiveAt: staff.lastActiveAt ? staff.lastActiveAt.toISOString() : null,
    branchId: staff.branchId,
    roles: staff.roles.map((userRole) => ({
      id: userRole.role.id,
      name: userRole.role.name,
      label: userRole.role.label,
      description: userRole.role.description,
      isSystem: userRole.role.isSystem,
    })),
    accessibleBranchIds: Array.from(
      new Set<string>([staff.branchId, ...staff.branchAccess.map((access) => access.branchId)]),
    ),
    position: staff.position,
    hireDate: staff.hireDate ? staff.hireDate.toISOString() : null,
    payFrequency: staff.payFrequency,
    baseSalary: staff.baseSalary ? staff.baseSalary.toNumber() : null,
    payDayOfMonth: staff.payDayOfMonth,
    shiftStartTime: staff.shiftStartTime,
    shiftEndTime: staff.shiftEndTime,
    workingDays: staff.workingDays,
    createdAt: staff.createdAt.toISOString(),
  };
}

export async function getUserDto(staffId: string): Promise<User | null> {
  const staff = await prisma.staffProfile.findUnique({
    where: { id: staffId },
    include: userInclude,
  });
  if (!staff || staff.isDeleted) return null;
  return mapStaffToUser(staff);
}
