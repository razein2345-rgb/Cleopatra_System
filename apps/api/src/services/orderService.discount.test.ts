import { describe, expect, it } from 'vitest';
import { assertItemDiscountsValid, ItemDiscountExceedsTotalError, resolveItemDiscountAmounts, sumItemDiscounts } from './orderService.js';

// Owner (2026-08-26, "الخصم على بند واحد عايزها نسبه مش بالجنيه") — the
// per-item discount switched from a caller-supplied currency amount to a
// caller-supplied percentage (0-100), converted server-side into the
// frozen currency amount OrderItem.discountAmount always stores.

describe('resolveItemDiscountAmounts', () => {
  it('converts each item percentage into a currency amount against that item\'s own total', () => {
    const items = [{ discountPercent: 10 }, { discountPercent: 50 }, {}];
    const priced = [{ total: 200 }, { total: 80 }, { total: 100 }];
    expect(resolveItemDiscountAmounts(items, priced)).toEqual([20, 40, 0]);
  });

  it('a 100% discount never exceeds the item total (float-safe)', () => {
    const items = [{ discountPercent: 100 }];
    const priced = [{ total: 149.99 }];
    const [amount] = resolveItemDiscountAmounts(items, priced);
    expect(amount).toBeCloseTo(149.99, 5);
    expect(amount).toBeLessThanOrEqual(priced[0]!.total);
  });
});

describe('assertItemDiscountsValid', () => {
  it('passes when every discount amount is within its item\'s total', () => {
    expect(() => assertItemDiscountsValid([20, 40, 0], [{ total: 200 }, { total: 80 }, { total: 100 }])).not.toThrow();
  });

  it('throws ItemDiscountExceedsTotalError with the offending index when a discount exceeds its total', () => {
    expect(() => assertItemDiscountsValid([250], [{ total: 200 }])).toThrow(ItemDiscountExceedsTotalError);
  });
});

describe('sumItemDiscounts', () => {
  it('sums the resolved per-item amounts', () => {
    expect(sumItemDiscounts([20, 40, 0])).toBe(60);
  });
});
