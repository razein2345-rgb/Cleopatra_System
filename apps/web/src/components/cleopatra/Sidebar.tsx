import { cn } from '@/lib/utils';
import { NavTree } from './NavTree';
import type { NavEntry } from './nav-types';

interface SidebarProps {
  entries: NavEntry[];
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}

/**
 * The desktop sidebar's inner content — also reused, unstyled by the
 * off-canvas frame, inside the mobile Sheet drawer in AppShell.
 */
export function Sidebar({ entries, collapsed = false, onNavigate, className }: SidebarProps) {
  return (
    <div className={cn('flex h-full flex-col gap-4 p-3', className)}>
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-2',
          collapsed && 'justify-center px-0',
        )}
      >
        <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-bold">
          C
        </div>
        {!collapsed && <span className="truncate text-sm font-bold">Cleopatra System</span>}
      </div>
      <nav className="flex-1 overflow-y-auto">
        <NavTree entries={entries} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>
    </div>
  );
}
