import type { SearchProvider } from '../types';
import { partnersProvider } from './partnersProvider';
import { quotationsProvider } from './quotationsProvider';
import { readyProductsProvider } from './readyProductsProvider';
import { servicesProvider } from './servicesProvider';

/**
 * Registered entity-search providers, rendered in this order after the
 * pages provider (built separately in CommandPalette.tsx from the live
 * nav tree). To add a provider for a new entity: write one file next to
 * these implementing `SearchProvider`, add it here. See REFINEMENTS.md §1
 * for which entities are intentionally not here yet (no list endpoint).
 */
export const SEARCH_PROVIDERS: SearchProvider[] = [
  partnersProvider,
  quotationsProvider,
  readyProductsProvider,
  servicesProvider,
];
