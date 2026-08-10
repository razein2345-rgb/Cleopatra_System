/**
 * FEATURE-007 PE-D — ready products / services costing (§3.9).
 *
 * Deliberately trivial and kept as its own function (rather than inlined
 * at call sites) purely so every item kind goes through the same "ask the
 * pricing engine" shape — no hidden markup, no margin, the unit price is
 * already the final price entered in Settings.
 */
export function calculateProductOrServiceCost(unitPrice: number, quantity: number, extraCosts = 0): number {
  return unitPrice * quantity + extraCosts;
}
