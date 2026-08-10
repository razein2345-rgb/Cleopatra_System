/**
 * The combined "Administrator" pool for the last-active-admin safety rule
 * (see ADR 0028). `ADMIN` holds `employees.*` (full staff/role management
 * within its branch); `SUPER_ADMIN` holds the global `*` wildcard. Losing
 * every active holder of either role is an equally real lockout, so both
 * are protected together rather than as two separate pools.
 *
 * Shared (not just backend-internal) so the frontend can compute the same
 * "is this the last active administrator" check for UI protection
 * (disabling impossible actions) without duplicating the role list —
 * `apps/api/src/services/adminSafety.ts` (`AdminSafetyService`) is still
 * the sole source of truth for actually *enforcing* the rule.
 */
export const ADMIN_ROLE_NAMES = ['SUPER_ADMIN', 'ADMIN'] as const;

export function hasAdminRole(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => (ADMIN_ROLE_NAMES as readonly string[]).includes(name));
}
