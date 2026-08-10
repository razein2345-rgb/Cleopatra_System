import { Compass } from 'lucide-react';
import { flattenNavLinks, type NavEntry } from '@/components/cleopatra/nav-types';
import type { SearchProvider } from './types';

/**
 * Wraps the live nav tree (the same one the Sidebar renders) as a search
 * provider, so page navigation is just another provider — the palette has
 * no special-cased "pages" group. Each nav link carries its own
 * `permission`, unlike other providers which are gated as a whole, so
 * filtering happens inside `fetch()` using the `can()` passed in at build
 * time rather than via `SearchProvider.permission`.
 */
export function buildPagesProvider(entries: NavEntry[], can: (permission: string) => boolean): SearchProvider {
  return {
    id: 'pages',
    groupLabel: 'الصفحات',
    async fetch() {
      return flattenNavLinks(entries)
        .filter((link) => !link.permission || (Array.isArray(link.permission) ? link.permission.some(can) : can(link.permission)))
        .map((link) => ({
          id: link.to,
          label: link.label,
          value: link.label,
          icon: link.icon ?? Compass,
          to: link.to,
        }));
    },
  };
}
