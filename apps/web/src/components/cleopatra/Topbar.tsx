import { useEffect, useState } from 'react';
import { Menu, PanelRightClose, PanelRightOpen, Search } from 'lucide-react';
import type { BranchSummary } from '@cleopatra/shared';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/state/AuthContext';

interface TopbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
  onOpenCommandPalette: () => void;
}

export function Topbar({
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileNav,
  onOpenCommandPalette,
}: TopbarProps) {
  const { authContext, signOut } = useAuth();
  const [branches, setBranches] = useState<BranchSummary[]>([]);

  useEffect(() => {
    let mounted = true;
    apiGet<BranchSummary[]>('/api/branches')
      .then((data) => {
        if (mounted) setBranches(data);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const branchName = branches.find((b) => b.id === authContext?.user.branchId)?.name;

  return (
    <header className="border-border bg-card flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="فتح القائمة"
      >
        <Menu className="size-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
      >
        {sidebarCollapsed ? (
          <PanelRightOpen className="size-5" />
        ) : (
          <PanelRightClose className="size-5" />
        )}
      </Button>

      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="border-input bg-background text-muted-foreground hover:bg-accent hidden flex-1 items-center gap-2 rounded-md border px-3 py-1.5 text-sm sm:flex sm:max-w-sm"
      >
        <Search className="size-4" />
        <span className="flex-1 text-start">بحث سريع…</span>
        <kbd className="bg-muted rounded border px-1.5 py-0.5 text-xs">Ctrl K</kbd>
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        onClick={onOpenCommandPalette}
        aria-label="بحث سريع"
      >
        <Search className="size-5" />
      </Button>

      <div className="ms-auto flex items-center gap-3 text-sm">
        {branchName && <span className="text-muted-foreground hidden md:inline">{branchName}</span>}
        <span className="text-muted-foreground hidden truncate sm:inline">
          {authContext?.user.name}
        </span>
        <Button variant="secondary" onClick={() => void signOut()}>
          تسجيل الخروج
        </Button>
      </div>
    </header>
  );
}
