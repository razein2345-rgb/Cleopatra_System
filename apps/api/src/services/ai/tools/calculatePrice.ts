import { z } from 'zod';
import { orderItemPricingInputSchema } from '@cleopatra/shared';
import { buildPricingContext, computeItemPricing, PricingInputError, type PricingLineItem } from '../../pricingEngineService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * The ONLY tool that touches the Pricing Engine — read-only by
 * construction, never persists anything (CLEOPATRA_AI_SECURITY.md §3).
 *
 * Contradiction found during Phase 1 verification (owner-approved
 * resolution): CLEOPATRA_AI_TOOLS.md described this as wrapping "the
 * preview path" of `pricingEngineService.ts`, as if a separate preview
 * function existed. It doesn't — `NewOrderPage.tsx`'s own `previewItemTotal`
 * is an explicitly-documented client-side mirror of `computeItemPricing`
 * ("same pure functions, used only for the live preview; the server always
 * recomputes authoritatively on submit"). The real, single source of truth
 * is `computeItemPricing` + `buildPricingContext` — the exact same
 * functions `createOrder`/`updateOrder` call for a real, persisted order.
 * This tool calls them the same way, just without ever writing the result
 * anywhere — so the AI is guaranteed byte-identical pricing to a real
 * order, never its own arithmetic.
 */
const inputSchema = z.object({
  pricing: orderItemPricingInputSchema,
  readyProductId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  boardsCatalogItemId: z.string().uuid().optional(),
});

export const calculatePriceTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'calculate_price',
  description:
    'Calculate the real Cleopatra price for one order item, using the actual pricing engine (never estimate this yourself). Input must match one of the pricing kinds (LOOSE_PAPER, NOTEBOOK, ENVELOPE, FOLDER, BOARDS, DIGITAL, PRODUCT_OR_SERVICE, INVENTORY_RETAIL, MANUAL) exactly as the order composer would send it.',
  requiredPermission: null,
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: {
      pricing: {
        type: 'object',
        description:
          'One pricing input, discriminated by "kind". kind must be one of: LOOSE_PAPER, NOTEBOOK, ENVELOPE, FOLDER, BOARDS, DIGITAL, PRODUCT_OR_SERVICE, INVENTORY_RETAIL, MANUAL. Each kind has its own required fields (sizes, color counts, quantities, material references, etc.) — search_inventory/get_inventory_item and the size/material catalogs describe what is available; ask the user for anything you cannot look up.',
        properties: { kind: { type: 'string' } },
        required: ['kind'],
      },
      readyProductId: { type: 'string', format: 'uuid' },
      serviceId: { type: 'string', format: 'uuid' },
      boardsCatalogItemId: { type: 'string', format: 'uuid' },
    },
    required: ['pricing'],
  },
  async execute(input) {
    const item: PricingLineItem = {
      pricing: input.pricing,
      readyProductId: input.readyProductId ?? null,
      serviceId: input.serviceId ?? null,
      boardsCatalogItemId: input.boardsCatalogItemId ?? null,
    };
    try {
      const ctx = await buildPricingContext([item]);
      const result = computeItemPricing(item, ctx);
      return { total: result.total, breakdown: result.breakdown };
    } catch (err) {
      if (err instanceof PricingInputError) {
        return { error: err.message };
      }
      throw err;
    }
  },
};
