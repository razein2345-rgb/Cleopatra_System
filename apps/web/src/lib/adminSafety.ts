import type { User } from '@cleopatra/shared';
import { ADMIN_ROLE_NAMES } from '@cleopatra/shared';

/**
 * UI-only convenience mirror of the backend's `AdminSafetyService`
 * (ADR 0028) — used to disable/hide impossible actions (Deactivate,
 * Delete, removing an admin role) in the Users screen. Uses the same
 * `ADMIN_ROLE_NAMES` pool as the backend so the two never drift, but this
 * is a UX heuristic only: the backend remains the sole source of truth
 * and re-checks on every request regardless of what the UI shows.
 */
export function isLastActiveAdmin(user: User, allUsers: User[]): boolean {
  const isAdmin = user.roles.some((r) => (ADMIN_ROLE_NAMES as readonly string[]).includes(r.name));
  if (!isAdmin || !user.isActive) return false;

  return !allUsers.some(
    (other) =>
      other.id !== user.id &&
      other.isActive &&
      other.roles.some((r) => (ADMIN_ROLE_NAMES as readonly string[]).includes(r.name)),
  );
}
