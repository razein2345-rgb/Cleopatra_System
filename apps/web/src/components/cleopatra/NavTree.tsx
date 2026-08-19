import { useState } from 'react';
import { NavLink as RouterNavLink } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/state/AuthContext';
import { cn } from '@/lib/utils';
import type { NavEntry } from './nav-types';

/** A string requires that exact permission; an array is satisfied by holding any one of them. `superAdminOnly` is a role check, independent of (and in addition to) any `permission`. */
function isPermitted(
  can: (key: string) => boolean,
  permission: string | string[] | undefined,
  superAdminOnly: boolean | undefined,
  isSuperAdmin: boolean,
): boolean {
  if (superAdminOnly && !isSuperAdmin) return false;
  if (!permission) return true;
  return Array.isArray(permission) ? permission.some(can) : can(permission);
}

interface NavTreeProps {
  entries: NavEntry[];
  /** Icon-rail mode: labels are hidden, only icons render. */
  collapsed?: boolean;
  /** Closes the mobile drawer after a link is followed. */
  onNavigate?: () => void;
  depth?: number;
}

export function NavTree({ entries, collapsed = false, onNavigate, depth = 0 }: NavTreeProps) {
  const { can, authContext } = useAuth();
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;
  const visible = entries.filter((entry) => isPermitted(can, entry.permission, entry.superAdminOnly, isSuperAdmin));

  return (
    <ul className="flex flex-col gap-0.5">
      {visible.map((entry) =>
        entry.kind === 'link' ? (
          <li key={entry.to}>
            <RouterNavLink
              to={entry.to}
              end={entry.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  depth > 0 && 'ps-8',
                  collapsed && 'justify-center px-2',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )
              }
              title={collapsed ? entry.label : undefined}
            >
              {entry.icon ? <entry.icon className="size-4 shrink-0" /> : null}
              {!collapsed && <span className="flex-1 truncate">{entry.label}</span>}
              {!!entry.badgeCount && (
                <span
                  className={cn(
                    'bg-danger text-danger-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold',
                    collapsed && 'absolute top-0.5 end-0.5 h-4 min-w-4 px-0.5 text-[10px]',
                  )}
                >
                  {entry.badgeCount}
                </span>
              )}
            </RouterNavLink>
          </li>
        ) : (
          <NavGroupItem
            key={entry.label}
            entry={entry}
            collapsed={collapsed}
            onNavigate={onNavigate}
            depth={depth}
          />
        ),
      )}
    </ul>
  );
}

function NavGroupItem({
  entry,
  collapsed,
  onNavigate,
  depth,
}: {
  entry: Extract<NavEntry, { kind: 'group' }>;
  collapsed: boolean;
  onNavigate?: () => void;
  depth: number;
}) {
  const { can, authContext } = useAuth();
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;
  const [open, setOpen] = useState(true);
  const visibleItems = entry.items.filter((item) => isPermitted(can, item.permission, item.superAdminOnly, isSuperAdmin));
  if (visibleItems.length === 0) return null;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
          collapsed && 'justify-center px-2',
        )}
        title={collapsed ? entry.label : undefined}
      >
        {entry.icon ? <entry.icon className="size-4 shrink-0" /> : null}
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-start">{entry.label}</span>
            <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
          </>
        )}
      </button>
      {open && !collapsed && (
        <NavTree entries={visibleItems} onNavigate={onNavigate} depth={depth + 1} />
      )}
    </li>
  );
}
