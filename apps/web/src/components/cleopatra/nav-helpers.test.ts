import { describe, expect, it } from 'vitest';
import { isNavLinkActive, navGroupContainsPath } from './nav-helpers';
import type { NavEntry } from './nav-types';

describe('isNavLinkActive', () => {
  const reports = { to: '/reports', inactiveWhenSearch: 'tab=reconciliation' };
  const reconciliation = { to: '/reports?tab=reconciliation' };

  it('a plain link follows the router', () => {
    expect(isNavLinkActive({ to: '/treasury' }, true, '/treasury', '')).toBe(true);
    expect(isNavLinkActive({ to: '/treasury' }, false, '/x', '')).toBe(false);
  });

  it('on the reconciliation tab only the query link is highlighted, not its plain sibling', () => {
    expect(isNavLinkActive(reconciliation, true, '/reports', '?tab=reconciliation')).toBe(true);
    expect(isNavLinkActive(reports, true, '/reports', '?tab=reconciliation')).toBe(false);
  });

  it('on any other reports tab the plain link is highlighted and the query link is not', () => {
    expect(isNavLinkActive(reports, true, '/reports', '')).toBe(true);
    expect(isNavLinkActive(reports, true, '/reports', '?tab=debts')).toBe(true);
    expect(isNavLinkActive(reconciliation, true, '/reports', '')).toBe(false);
    expect(isNavLinkActive(reconciliation, true, '/reports', '?tab=debts')).toBe(false);
  });

  it('a query link is never active when the router says the path is not', () => {
    expect(isNavLinkActive(reconciliation, false, '/x', '?tab=reconciliation')).toBe(false);
  });
});

describe('isNavLinkActive - a sibling with a longer path owns its pages', () => {
  const users = { to: '/users', inactiveOnPaths: ['/users/advances-report'] };

  it('the parent link stays active on its own nested pages (profile, payroll report)', () => {
    expect(isNavLinkActive(users, true, '/users', '')).toBe(true);
    expect(isNavLinkActive(users, true, '/users/abc', '')).toBe(true);
    expect(isNavLinkActive(users, true, '/users/abc/payroll-report', '')).toBe(true);
  });

  it('but not on the advances report, which has its own link', () => {
    expect(isNavLinkActive(users, true, '/users/advances-report', '')).toBe(false);
  });
});

describe('navGroupContainsPath - which group starts open', () => {
  const items: NavEntry[] = [
    { kind: 'link', to: '/quotations', label: 'المستندات', alsoMatches: ['/orders/'] },
    { kind: 'link', to: '/partners', label: 'العملاء' },
    { kind: 'link', to: '/reports?tab=reconciliation', label: 'مطابقة' },
  ];

  it('matches the link path and its nested pages', () => {
    expect(navGroupContainsPath(items, '/partners')).toBe(true);
    expect(navGroupContainsPath(items, '/partners/abc')).toBe(true);
  });

  it('matches extra prefixes (an invoice page belongs to the documents link)', () => {
    expect(navGroupContainsPath(items, '/orders/abc')).toBe(true);
  });

  it('matches a query link by its path', () => {
    expect(navGroupContainsPath(items, '/reports')).toBe(true);
  });

  it('does not match a look-alike prefix or an unrelated page', () => {
    expect(navGroupContainsPath(items, '/partnersX')).toBe(false);
    expect(navGroupContainsPath(items, '/treasury')).toBe(false);
  });

  it('the dashboard root only owns "/" exactly', () => {
    const withRoot: NavEntry[] = [{ kind: 'link', to: '/', label: 'لوحة', end: true }];
    expect(navGroupContainsPath(withRoot, '/')).toBe(true);
    expect(navGroupContainsPath(withRoot, '/treasury')).toBe(false);
  });
});
