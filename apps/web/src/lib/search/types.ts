import type { LucideIcon } from 'lucide-react';

/** One row a provider contributes to the palette. */
export interface SearchResultItem {
  id: string;
  /** Text shown in the row. */
  label: string;
  /** Text cmdk's built-in fuzzy filter matches against — may be richer than `label`. */
  value: string;
  icon: LucideIcon;
  /** Route the palette navigates to when this item is selected. */
  to: string;
}

/**
 * One searchable entity type. `fetch()` is called every time the palette
 * opens (no caching — see CommandPalette.tsx) and its results render as one
 * `CommandGroup`. A provider with a `permission` is only fetched/rendered
 * for a user who has it, mirroring the Sidebar's own `can()` gating.
 *
 * Adding a new searchable entity (Orders, Work Orders, Inventory, Library
 * Products, Machines, Employees, Suppliers, Treasury, Invoices, Marketing
 * Leads, Goals, Workflow Templates, ...) is: implement this interface in
 * `providers/`, add it to `SEARCH_PROVIDERS`. Nothing else changes — see
 * REFINEMENTS.md §1.
 */
export interface SearchProvider {
  id: string;
  /** Arabic group heading shown above this provider's results. */
  groupLabel: string;
  permission?: string;
  fetch: () => Promise<SearchResultItem[]>;
}
