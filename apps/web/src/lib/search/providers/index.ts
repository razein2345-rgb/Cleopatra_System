import type { SearchProvider } from '../types';
import { employeesProvider } from './employeesProvider';
import { inventoryProvider } from './inventoryProvider';
import { machinesProvider } from './machinesProvider';
import { ordersProvider } from './ordersProvider';
import { partnersProvider } from './partnersProvider';
import { quotationsProvider } from './quotationsProvider';
import { readyProductsProvider } from './readyProductsProvider';
import { servicesProvider } from './servicesProvider';
import { treasuryProvider } from './treasuryProvider';
import { workOrdersProvider } from './workOrdersProvider';

/**
 * Registered entity-search providers, rendered in this order after the
 * pages provider (built separately in CommandPalette.tsx from the live
 * nav tree). To add a provider for a new entity: write one file next to
 * these implementing `SearchProvider`, add it here. See REFINEMENTS.md §1
 * for which entities are intentionally not here yet (no list endpoint) —
 * Orders/Work Orders/Inventory/Employees/Machines/Treasury (2026-08-18)
 * closed six of that list once their list endpoints existed; Suppliers,
 * Invoices (separate from Orders), Marketing Leads, Goals, and Workflow
 * Templates still have no dedicated list screen to search.
 */
export const SEARCH_PROVIDERS: SearchProvider[] = [
  partnersProvider,
  ordersProvider,
  workOrdersProvider,
  quotationsProvider,
  inventoryProvider,
  readyProductsProvider,
  servicesProvider,
  employeesProvider,
  machinesProvider,
  treasuryProvider,
];
