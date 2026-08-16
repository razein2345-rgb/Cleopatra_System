import { Navigate } from 'react-router-dom';
import { useAuth } from '@/state/AuthContext';
import { DashboardPage } from './DashboardPage';

/**
 * ERP-navigation research (2026-08-16, owner-requested department-structure
 * research): "a well-designed system shows executives different landing
 * pages than data entry clerks." Cashier/Production-Manager/Designer/
 * Printing-Operator log in dozens of times a day to do exactly one thing —
 * sending them through the full Dashboard first costs a click every time.
 * This is routing only, never a merged/custom screen (system_specifications_v2.md
 * §19.0's "ممنوع دمج الشاشات" rule stays intact) — every target below is the
 * same fixed, independent screen every other entry point already uses.
 *
 * Multi-role staff (§21.1) resolve by priority: anyone holding a broader
 * role (SUPER_ADMIN/ADMIN/SALES/VIEWER) always lands on the Dashboard —
 * a role that needs the wide view outranks a narrow single-purpose one,
 * even if they also hold it.
 */
const BROAD_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'SALES', 'VIEWER']);

// Targets match each role's actual seeded permissions (seed.ts) — never a
// route the role can't reach, which would just trade one click for a
// confusing access-denied wall right after login. CASHIER is seeded with
// `treasury.*` + view-only on orders/partners (no `orders.create`), so its
// home is Treasury, not the order composer — a Sales-role redirect target
// would need `orders.create`/`quotations.create`, but SALES is already a
// broad role that stays on the Dashboard.
const NARROW_ROLE_HOME: Record<string, string> = {
  CASHIER: '/treasury',
  PRODUCTION_MANAGER: '/production-board',
  DESIGNER: '/production-board',
  PRINTING_OPERATOR: '/production-board',
};

function resolveHome(roleNames: string[]): string | null {
  if (roleNames.some((name) => BROAD_ROLES.has(name))) return null;
  for (const name of roleNames) {
    const target = NARROW_ROLE_HOME[name];
    if (target) return target;
  }
  return null;
}

export function RoleHome() {
  const { authContext } = useAuth();
  const target = resolveHome(authContext?.user.roles.map((r) => r.name) ?? []);
  if (target) return <Navigate to={target} replace />;
  return <DashboardPage />;
}
