import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The Critical Pricing Rule (CLEOPATRA_AI_SECURITY.md §3): Cleopatra AI
 * must never compute a price itself. This test proves `calculate_price`
 * always calls the real pricing engine (`buildPricingContext` +
 * `computeItemPricing`) and returns exactly what it returns — never its
 * own arithmetic, never an approximation.
 */
type PricingEngineModule = typeof import('../../pricingEngineService.js');

const buildPricingContext = vi.fn<PricingEngineModule['buildPricingContext']>(async () => ({ fakeContext: true }) as never);
const computeItemPricing = vi.fn<PricingEngineModule['computeItemPricing']>(
  () => ({ total: 123.45, breakdown: { fake: true } }) as never,
);

vi.mock('../../pricingEngineService.js', async () => {
  const actual = await vi.importActual<PricingEngineModule>('../../pricingEngineService.js');
  return { ...actual, buildPricingContext, computeItemPricing };
});

const { calculatePriceTool } = await import('./calculatePrice.js');

beforeEach(() => {
  buildPricingContext.mockClear();
  computeItemPricing.mockClear();
});

describe('calculate_price tool', () => {
  it('calls the real pricing engine and returns its exact result, never its own arithmetic', async () => {
    const input = calculatePriceTool.inputSchema.parse({
      pricing: { kind: 'MANUAL', unitPrice: 10, quantity: 3 },
    });

    const result = (await calculatePriceTool.execute(input, {
      auth: { permissions: [], roleNames: [] } as never,
    })) as { total: number; breakdown: unknown };

    expect(buildPricingContext).toHaveBeenCalledTimes(1);
    expect(computeItemPricing).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(123.45);
    expect(result.breakdown).toEqual({ fake: true });
  });

  it('needs no permission beyond being authenticated (pricing preview is not permission-gated in the composer either)', () => {
    expect(calculatePriceTool.requiredPermission).toBeNull();
  });
});
