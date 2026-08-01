import { prisma } from '../lib/prisma.js';

export type AuthenticatedUser = {
  staffId: string;
  supabaseUserId: string;
  name: string;
  email: string;
  branchId: string;
  isActive: boolean;
  roleNames: string[];
  permissions: string[];
  accessibleBranchIds: string[];
};

/**
 * Loads the full authorization context for a Supabase Auth user: their
 * StaffProfile, roles, flattened+deduped permission keys (from every role
 * they hold), and the set of branch ids they may access. Returns `null` if
 * no matching, non-deleted StaffProfile exists — a valid Supabase session
 * with no corresponding StaffProfile is not authorized to use this API.
 */
export async function loadAuthContext(supabaseUserId: string): Promise<AuthenticatedUser | null> {
  const staff = await prisma.staffProfile.findUnique({
    where: { supabaseUserId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      branchAccess: true,
    },
  });

  if (!staff || staff.isDeleted) {
    return null;
  }

  const roleNames = staff.roles.map((userRole) => userRole.role.name);

  const permissionSet = new Set<string>();
  for (const userRole of staff.roles) {
    for (const rolePermission of userRole.role.permissions) {
      permissionSet.add(rolePermission.permission.key);
    }
  }

  const accessibleBranchIds = new Set<string>([
    staff.branchId,
    ...staff.branchAccess.map((access) => access.branchId),
  ]);

  return {
    staffId: staff.id,
    supabaseUserId: staff.supabaseUserId,
    name: staff.name,
    email: staff.email,
    branchId: staff.branchId,
    isActive: staff.isActive,
    roleNames,
    permissions: Array.from(permissionSet),
    accessibleBranchIds: Array.from(accessibleBranchIds),
  };
}

/** Super Admin bypasses branch scoping entirely; everyone else needs their home branch or an explicit grant. */
export function canAccessBranch(user: AuthenticatedUser, branchId: string): boolean {
  if (user.roleNames.includes('SUPER_ADMIN')) return true;
  return user.accessibleBranchIds.includes(branchId);
}
