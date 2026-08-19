import type { LucideIcon } from 'lucide-react';

/**
 * A single navigable route. `end` mirrors react-router's NavLink `end` prop
 * (exact-match highlighting), needed for the root "/" Dashboard entry.
 */
export interface NavLink {
  kind: 'link';
  to: string;
  label: string;
  icon?: LucideIcon;
  /** A single required permission, or a list where holding any one is enough (e.g. Treasury: `treasury.view` OR `treasury.create`). */
  permission?: string | string[];
  /** Owner ("مفيش شاشة لعرض الـAudit Log نفسه") — a role restriction, not a permission-catalog check (same class as the attendance admin screen: reveals sensitive data across every module, not gated by the regular `permission` system at all). */
  superAdminOnly?: boolean;
  end?: boolean;
  /** FEATURE-005 Sprint 2.5 — an attention count (e.g. delayed jobs), not a status. Omitted or 0 renders no badge. */
  badgeCount?: number;
}

/**
 * A nav group with nested entries. `NavEntry` is recursive so the sidebar
 * and command palette support arbitrarily deep future nav (e.g. Orders >
 * Purchase Orders > Drafts) without a data-structure change — M1's actual
 * nav content stays flat, this is the structural readiness the App Shell
 * refinement asks for.
 */
export interface NavGroup {
  kind: 'group';
  label: string;
  icon?: LucideIcon;
  permission?: string | string[];
  /** See `NavLink.superAdminOnly` — same role restriction, applicable to a whole group too. */
  superAdminOnly?: boolean;
  items: NavEntry[];
}

export type NavEntry = NavLink | NavGroup;

/** Flattens a nav tree into its leaf links — used by the command palette. */
export function flattenNavLinks(entries: NavEntry[]): NavLink[] {
  return entries.flatMap((entry) =>
    entry.kind === 'link' ? [entry] : flattenNavLinks(entry.items),
  );
}
