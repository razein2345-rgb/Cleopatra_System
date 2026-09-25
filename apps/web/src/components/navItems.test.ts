import { describe, expect, it } from 'vitest';
import { flattenNavLinks, type NavEntry } from './cleopatra/nav-types';
import { NAV_ITEMS } from './navItems';

/**
 * Structure guard for the 2026-09-25 sidebar re-organization (4 groups -> 7).
 * It is a pure regrouping: every link that existed before must still exist,
 * exactly once, with the SAME permission - so no role gains or loses access to
 * a screen - plus the three deliberately added links.
 */

type Link = ReturnType<typeof flattenNavLinks>[number];

// path -> permission, exactly as the sidebar defined them BEFORE the re-organization.
const PREVIOUS_LINKS: Record<string, Link['permission'] | 'SUPER_ADMIN_ONLY' | undefined> = {
  '/': undefined,
  '/ai-assistant': undefined,
  '/pos': 'orders.create',
  '/production-board': 'work-orders.view',
  '/machines': 'machines.view',
  '/workflow-templates': 'workflow-templates.view',
  '/communication-hub': undefined,
  '/leads': 'leads.view',
  '/call-center': 'call-logs.view',
  '/content-calendar': 'content-calendar.view',
  '/campaigns': 'campaigns.view',
  '/partners': 'partners.view',
  '/reorder-due': 'orders.view',
  '/suppliers': 'suppliers.view',
  '/quotations': 'quotations.view',
  '/inventory': 'inventory.view',
  '/treasury': ['treasury.view', 'treasury.create'],
  '/expenses': 'expenses.view',
  '/reports': 'reports.view',
  '/cutover': 'treasury.view',
  '/customer-opening': 'treasury.view',
  '/users': 'employees.view',
  '/attendance/kiosk': 'attendance.kiosk',
  '/roles': 'roles.view',
  '/permissions': 'permissions.view',
  '/settings': 'settings.view',
  '/audit-log': 'SUPER_ADMIN_ONLY',
  '/devices': 'SUPER_ADMIN_ONLY',
};

const NEW_LINKS: Record<string, Link['permission']> = {
  '/users/advances-report': 'employees.view',
  '/orders/new': 'orders.create',
  '/reports?tab=reconciliation': 'reports.view',
};

const links = flattenNavLinks(NAV_ITEMS);
const byTo = new Map(links.map((l) => [l.to, l]));

function groupOf(to: string): string | null {
  for (const entry of NAV_ITEMS) {
    if (entry.kind === 'group' && flattenNavLinks(entry.items).some((l) => l.to === to)) return entry.label;
  }
  return null;
}

describe('sidebar structure', () => {
  it('has the agreed 7 groups, in order, plus the three ungrouped top-level links', () => {
    const top = NAV_ITEMS.map((e: NavEntry) => (e.kind === 'group' ? `group:${e.label}` : `link:${e.to}`));
    expect(top).toEqual([
      'link:/',
      'link:/ai-assistant',
      'link:/pos',
      'group:الحسابات',
      'group:التسويق',
      'group:المبيعات',
      'group:الإدارة',
      'group:المخازن',
      'group:الإنتاج',
      'group:النظام',
    ]);
  });

  it('no link appears twice', () => {
    expect(new Set(links.map((l) => l.to)).size).toBe(links.length);
  });

  it('every pre-existing link is still there with the same permission (nobody gains or loses access)', () => {
    for (const [to, expected] of Object.entries(PREVIOUS_LINKS)) {
      const link = byTo.get(to);
      expect(link, `missing ${to}`).toBeDefined();
      if (expected === 'SUPER_ADMIN_ONLY') {
        expect(link!.superAdminOnly, to).toBe(true);
        expect(link!.permission, to).toBeUndefined();
      } else {
        expect(link!.permission, to).toEqual(expected);
        expect(link!.superAdminOnly, to).toBeFalsy();
      }
    }
  });

  it('the only additions are the three agreed links, each gated like its own route', () => {
    const known = new Set([...Object.keys(PREVIOUS_LINKS), ...Object.keys(NEW_LINKS)]);
    expect(links.filter((l) => !known.has(l.to)).map((l) => l.to)).toEqual([]);
    for (const [to, permission] of Object.entries(NEW_LINKS)) {
      expect(byTo.get(to)?.permission, to).toEqual(permission);
    }
  });

  it('each link sits in the agreed group', () => {
    const expected: Record<string, string> = {
      '/treasury': 'الحسابات', '/expenses': 'الحسابات', '/reports': 'الحسابات', '/cutover': 'الحسابات', '/customer-opening': 'الحسابات',
      '/leads': 'التسويق', '/campaigns': 'التسويق', '/call-center': 'التسويق', '/content-calendar': 'التسويق',
      '/orders/new': 'المبيعات', '/quotations': 'المبيعات', '/partners': 'المبيعات', '/reorder-due': 'المبيعات', '/communication-hub': 'المبيعات',
      '/users': 'الإدارة', '/users/advances-report': 'الإدارة', '/attendance/kiosk': 'الإدارة', '/roles': 'الإدارة', '/permissions': 'الإدارة',
      '/inventory': 'المخازن', '/suppliers': 'المخازن', '/reports?tab=reconciliation': 'المخازن',
      '/production-board': 'الإنتاج', '/machines': 'الإنتاج', '/workflow-templates': 'الإنتاج',
      '/settings': 'النظام', '/audit-log': 'النظام', '/devices': 'النظام',
    };
    for (const [to, group] of Object.entries(expected)) {
      expect(groupOf(to), to).toBe(group);
    }
    // and nothing was left out of the table above
    expect(Object.keys(expected).length).toBe(links.filter((l) => groupOf(l.to) !== null).length);
  });

  it('the reports link and its reconciliation shortcut do not highlight together', () => {
    expect(byTo.get('/reports')?.inactiveWhenSearch).toBe('tab=reconciliation');
  });
});
