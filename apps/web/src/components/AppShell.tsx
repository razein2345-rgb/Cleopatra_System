import { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { WorkflowDashboardSummary } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Sidebar, Topbar, CommandPalette, MobileNavDrawer } from '@/components/cleopatra';
import type { NavEntry } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import { NAV_ITEMS } from '@/components/navItems';

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
