import { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings as SettingsIcon,
  Building2,
  FileText,
  Factory,
  UserCog,
  ShieldCheck,
  KeyRound,
  Wallet,
  Package,
  Briefcase,
  Wrench,
  MonitorSmartphone,
} from 'lucide-react';
import type { WorkflowDashboardSummary } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Sidebar, Topbar, CommandPalette, MobileNavDrawer } from '@/components/cleopatra';
import type { NavEntry } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

/**
 * ERP-navigation research (2026-08-16, owner-requested department-structure
 * research): grouping nav links under clear section headers — instead of
 * one flat list — is the recurring pattern for small teams where one
 * employee holds several roles at once, so "مين بيمسك إيه" reads at a
 * glance. Reuses `NavTree`'s existing `kind: 'group'` support (already
 * built, just never populated with more than the flat list below it) —
 * no new component, no new permission logic; a group simply hides itself
 * if none of its items are visible to the current user's permissions
 * (`NavGroupItem`'s existing `visibleItems.length === 0` check).
 */
const NAV_ITEMS: NavEntry[] = [
  { kind: 'link', to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, end: true },
  {
    kind: 'group',
    label: 'الإنتاج',
    icon: Factory,
    items: [
      { kind: 'link', to: '/production-board', label: 'لوحة الإنتاج', icon: Factory, permission: 'work-orders.view' },
      { kind: 'link', to: '/machines', label: 'الماكينات', icon: Wrench, permission: 'machines.view' },
    ],
  },
  {
    kind: 'group',
    label: 'الإدارة والتجارة',
    icon: Briefcase,
    items: [
      { kind: 'link', to: '/partners', label: 'العملاء', icon: Building2, permission: 'partners.view' },
      { kind: 'link', to: '/quotations', label: 'المستندات', icon: FileText, permission: 'quotations.view' },
      { kind: 'link', to: '/inventory', label: 'المخزن', icon: Package, permission: 'inventory.view' },
    ],
  },
  {
    kind: 'group',
    label: 'المالية',
    icon: Wallet,
    items: [
      {
        kind: 'link',
        to: '/treasury',
        label: 'الخزينة والنقدية',
        icon: Wallet,
        // FEATURE-007 M3 — reception (treasury.create only) sees a scoped
        // view of this same page; treasury.view sees the full ledger/balance.
        permission: ['treasury.view', 'treasury.create'],
      },
    ],
  },
  {
    kind: 'group',
    label: 'النظام',
    icon: ShieldCheck,
    items: [
      { kind: 'link', to: '/users', label: 'الموظفين', icon: UserCog, permission: 'employees.view' },
      // Owner (2026-08-17): a nav entry point for the attendance Kiosk
      // (previously URL-only), visible to the Super Admin role only —
      // mirrors the existing "attendance admin screen restricted to Super
      // Admin" precedent (UsersPage.tsx's `isSuperAdmin` check). No
      // `permission` key: this is a role gate, not a grantable permission,
      // same reasoning as that precedent.
      { kind: 'link', to: '/attendance/kiosk', label: 'كشك الحضور', icon: MonitorSmartphone, requireSuperAdmin: true },
      { kind: 'link', to: '/roles', label: 'الأدوار', icon: ShieldCheck, permission: 'roles.view' },
      { kind: 'link', to: '/permissions', label: 'الصلاحيات', icon: KeyRound, permission: 'permissions.view' },
      { kind: 'link', to: '/settings', label: 'الإعدادات', icon: SettingsIcon, permission: 'settings.view' },
    ],
  },
];

/**
 * FEATURE-005 Sprint 2.5 — the sidebar's delayed-job badge. A second,
 * independent fetch of `dashboard-summary` (the same endpoint
 * `WorkflowQueueSummaryProvider` reads for the Dashboard page), not a
 * shared context — the provider is scoped inside `DashboardPage`, which
 * doesn't wrap the always-mounted Sidebar. Approved as the smaller, lower-
 * risk option over lifting that provider into `AppShell` (01_ANALYSIS.md's
 * Architecture Decision). Mirrors `Topbar.tsx`'s own independent
 * `GET /api/branches` fetch — an existing precedent, not a new pattern.
 */
function useDelayedJobsBadge(canView: boolean): number | undefined {
  const [delayed, setDelayed] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    apiGet<WorkflowDashboardSummary>('/api/workflow-instances/dashboard-summary')
      .then((summary) => {
        if (!cancelled) setDelayed(summary.totals.delayed);
      })
      .catch(() => {
        if (!cancelled) setDelayed(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [canView]);

  return delayed;
}

/** FEATURE-007 — the top bar's logo (owner, 2026-08-12: "عايز احط اللوجو في السيستم فوق"), fetched once via the requireAuth-only `/settings/branding` endpoint so it shows for every role, not just orders.view holders. */
function useBranding(): { logoUrl: string | null; businessName: string | null } {
  const [branding, setBranding] = useState<{ logoUrl: string | null; businessName: string | null }>({
    logoUrl: null,
    businessName: null,
  });

  useEffect(() => {
    apiGet<{ businessNameAr: string | null; logoUrl: string | null }>('/api/settings/branding')
      .then((data) => setBranding({ logoUrl: data.logoUrl, businessName: data.businessNameAr }))
      .catch(() => setBranding({ logoUrl: null, businessName: null }));
  }, []);

  return branding;
}

/** Recurses into `kind: 'group'` entries to find `/production-board` and attach its badge — needed now that it's nested under "الإنتاج" instead of sitting flat in the top-level list. */
function withProductionBadge(entries: NavEntry[], delayedCount: number | undefined): NavEntry[] {
  return entries.map((entry) => {
    if (entry.kind === 'link') {
      return entry.to === '/production-board' ? { ...entry, badgeCount: delayedCount } : entry;
    }
    return { ...entry, items: withProductionBadge(entry.items, delayedCount) };
  });
}

export function AppShell() {
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const { can } = useAuth();
  const delayedCount = useDelayedJobsBadge(can('work-orders.view'));
  const branding = useBranding();

  const navItems = useMemo<NavEntry[]>(() => withProductionBadge(NAV_ITEMS, delayedCount), [delayedCount]);

  return (
    <div className="flex h-svh overflow-hidden">
      <aside
        className="border-border bg-card hidden shrink-0 border-e transition-[width] duration-200 lg:block"
        style={{ width: desktopCollapsed ? '4.5rem' : '16rem' }}
      >
        <Sidebar entries={navItems} collapsed={desktopCollapsed} logoUrl={branding.logoUrl} businessName={branding.businessName} />
      </aside>

      <MobileNavDrawer
        entries={navItems}
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        logoUrl={branding.logoUrl}
        businessName={branding.businessName}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          sidebarCollapsed={desktopCollapsed}
          onToggleSidebar={() => setDesktopCollapsed((v) => !v)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette entries={navItems} open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </div>
  );
}
