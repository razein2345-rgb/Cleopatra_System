import type { User } from '@cleopatra/shared';

/**
 * Owner (2026-08-20, "محتاج اشوف مين الموظف الأكتيف على السيستم") — shared
 * by `UsersPage.tsx` and `OnlineEmployeesWidget.tsx` so "online" is defined
 * in exactly one place. There's no real session/heartbeat mechanism (auth
 * is stateless Supabase JWT verification per request — see
 * `requireAuth.ts`), so this is an approximation: "made an authenticated
 * request within the last few minutes" (`StaffProfile.lastActiveAt`,
 * refreshed server-side on every authenticated call).
 */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isOnlineNow(user: Pick<User, 'lastActiveAt'>): boolean {
  return Boolean(user.lastActiveAt && Date.now() - new Date(user.lastActiveAt).getTime() < ONLINE_WINDOW_MS);
}
