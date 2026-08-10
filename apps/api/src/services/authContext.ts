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
  accessibleDepartmentIds: string[];
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
      departmentAccess: true,
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

  const accessibleDepartmentIds = new Set<string>([
    ...(staff.departmentId ? [staff.departmentId] : []),
    ...staff.departmentAccess.map((access) => access.departmentId),
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
    accessibleDepartmentIds: Array.from(accessibleDepartmentIds),
  };
}

/** Super Admin bypasses branch scoping entirely; everyone else needs their home branch or an explicit grant. */
export function canAccessBranch(user: AuthenticatedUser, branchId: string): boolean {
  if (user.roleNames.includes('SUPER_ADMIN')) return true;
  return user.accessibleBranchIds.includes(branchId);
}

/**
 * FEATURE-004 M1. Mirrors `canAccessBranch` exactly — Super Admin (and, per
 * 01_ANALYSIS.md's Permission Mapping, anyone holding `work-orders.edit`,
 * the stage-advancement grant) bypasses department scoping; everyone else
 * only sees queues for their home department or an explicit
 * `UserDepartmentAccess` grant. A caller with no department at all (e.g.
 * Sales, Admin) simply has an empty queue set, not an error.
 */
export function canAccessDepartment(user: AuthenticatedUser, departmentId: string): boolean {
  if (user.roleNames.includes('SUPER_ADMIN')) return true;
  if (user.permissions.includes('work-orders.*') || user.permissions.includes('*')) return true;
  return user.accessibleDepartmentIds.includes(departmentId);
}

/**
 * The same bypass rule as `canAccessDepartment`, restated as a scope for
 * queries that need "every department this caller may see" rather than a
 * single yes/no check (FEATURE-005 Sprint 2's dashboard-summary
 * aggregate). `'all'` means no department filter should be applied at
 * all — not "every department id enumerated" — so a query built from this
 * never has to special-case an empty-vs-unbounded list.
 */
export function accessibleDepartmentScope(user: AuthenticatedUser): string[] | 'all' {
  if (user.roleNames.includes('SUPER_ADMIN')) return 'all';
  if (user.permissions.includes('work-orders.*') || user.permissions.includes('*')) return 'all';
  return user.accessibleDepartmentIds;
}
