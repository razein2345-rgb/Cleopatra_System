import { flattenNavLinks, type NavEntry, type NavLink } from './nav-types';

/** True when every key/value of `query` ("tab=reconciliation") is present in `search` ("?tab=reconciliation&x=1"). */
function searchContains(search: string, query: string): boolean {
  const have = new URLSearchParams(search);
  const want = new URLSearchParams(query);
  for (const [key, value] of want) {
    if (have.get(key) !== value) return false;
  }
  return true;
}

/**
 * Highlight rule for a sidebar link. `routerIsActive` is react-router's own
 * path-based answer; a link with a query in `to` additionally needs that query
 * in the URL, and its plain sibling can opt out while that query is present.
 */
export function isNavLinkActive(
  link: Pick<NavLink, 'to' | 'inactiveWhenSearch' | 'inactiveOnPaths'>,
  routerIsActive: boolean,
  pathname: string,
  search: string,
): boolean {
  if (link.inactiveOnPaths?.some((prefix) => pathname.startsWith(prefix))) return false;
  const queryStart = link.to.indexOf('?');
  if (queryStart !== -1) {
    return routerIsActive && searchContains(search, link.to.slice(queryStart + 1));
  }
  if (link.inactiveWhenSearch && searchContains(search, link.inactiveWhenSearch)) return false;
  return routerIsActive;
}

function linkOwnsPath(link: NavLink, pathname: string): boolean {
  const path = link.to.split('?')[0]!;
  if (path === '/') return pathname === '/';
  if (link.end) return pathname === path;
  if (pathname === path || pathname.startsWith(`${path}/`)) return true;
  return (link.alsoMatches ?? []).some((prefix) => pathname.startsWith(prefix));
}

/** Does any link under this group's items own the current page? Decides which group starts open. */
export function navGroupContainsPath(items: NavEntry[], pathname: string): boolean {
  return flattenNavLinks(items).some((link) => linkOwnsPath(link, pathname));
}
