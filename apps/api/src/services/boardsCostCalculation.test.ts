import { describe, expect, it } from 'vitest';
import { calculateBoardsCost, type BoardsPricingConstants } from '@cleopatra/shared';

// No confirmed worked example exists for boards/signage (unlike notebooks)
// — these tests check the formula is applied exactly as written in
// PRICING_ENGINE_SPEC.md §3.8, not against real business numbers. Flagged
// in 02_PLAN.md as a known confidence gap, same as envelopes/folders.

const SETTINGS: BoardsPricingConstants = {
  boardsBannerNoDesign: 50,
  boardsBannerWithDesign: 60,
  boardsVinylNormalNoSello: 40,
  boardsVinylNormalWithSello: 55,
  boardsVinylPrintCutNoSello: 70,
  boardsVinylPrintCutWithSello: 90,
  boardsFlex: 45,
  boardsSeasro: 35,
  boardsGapMM: 5,
};

describe('calculateBoardsCost — area-based materials (§3.8, no margin applied)', () => {
  it('banner with design: area × price, no profit margin on top', () => {
    const result = calculateBoardsCost({
      material: 'BANNER',
      widthCm: 200,
      heightCm: 100,
      quantity: 5,
      hasDesign: true,
      settings: SETTINGS,
    });
    expect(result.pricePerMeter).toBe(60);
    expect(result.pieceAreaM2).toBe(2); // (200/100) * (100/100)
    expect(result.totalAreaM2).toBe(10); // 2 * 5
    expect(result.total).toBe(600); // 10 * 60 — no (1 + profit%) multiplier anywhere
  });

  it('flex and seasro use their own single price, no design/sello variants', () => {
    const flex = calculateBoardsCost({ material: 'FLEX', widthCm: 100, heightCm: 100, quantity: 1, settings: SETTINGS });
    const seasro = calculateBoardsCost({ material: 'SEASRO', widthCm: 100, heightCm: 100, quantity: 1, settings: SETTINGS });
    expect(flex.pricePerMeter).toBe(45);
    expect(seasro.pricePerMeter).toBe(35);
  });

  it('vinyl normal with/without sellophane picks the right price', () => {
    const withSello = calculateBoardsCost({
      material: 'VINYL_NORMAL',
      widthCm: 100,
      heightCm: 100,
      quantity: 1,
      hasSellophane: true,
      settings: SETTINGS,
    });
    const noSello = calculateBoardsCost({
      material: 'VINYL_NORMAL',
      widthCm: 100,
      heightCm: 100,
      quantity: 1,
      hasSellophane: false,
      settings: SETTINGS,
    });
    expect(withSello.pricePerMeter).toBe(55);
    expect(noSello.pricePerMeter).toBe(40);
  });
});

describe('calculateBoardsCost — VINYL_PRINT_CUT piece-packing (§3.8)', () => {
  it('packs pieces per square meter using the gap formula', () => {
    const result = calculateBoardsCost({
      material: 'VINYL_PRINT_CUT',
      widthCm: 20,
      heightCm: 20,
      quantity: 100,
      hasSellophane: false,
      settings: SETTINGS,
    });
    // gapCm = 5mm/10 = 0.5; perRow = floor(100.5 / 20.5) = 4; perCol = 4
    expect(result.piecesPerMeter).toBe(16);
    expect(result.metersNeeded).toBe(7); // ceil(100/16)
    expect(result.total).toBe(7 * 70); // metersNeeded * boardsVinylPrintCutNoSello
  });

  it('throws when the piece is too large to fit even once per meter', () => {
    expect(() =>
      calculateBoardsCost({
        material: 'VINYL_PRINT_CUT',
        widthCm: 150,
        heightCm: 150,
        quantity: 1,
        settings: SETTINGS,
      }),
    ).toThrow();
  });
});

// FEATURE-007 — owner-approved manual "خدمات إضافية" (2026-08-10).
describe('calculateBoardsCost — extraCosts (owner-approved manual override, 2026-08-10)', () => {
  it('adds extraCosts directly to total, never multiplied by a margin (boards never apply one)', () => {
    const result = calculateBoardsCost({
      material: 'FLEX',
      widthCm: 100,
      heightCm: 100,
      quantity: 1,
      settings: SETTINGS,
      extraCosts: 20,
    });
    expect(result.total).toBe(45 + 20); // pricePerMeter(45) * 1m² + extraCosts(20)
  });
});

// Owner (2026-08-26, "أكتب السعر النهائي يدويًا للصنف ده") — BOARDS had no
// price-override concept at all before this.
describe('calculateBoardsCost — pricePerMeterOverride', () => {
  it('replaces the settings-resolved rate, keeping the existing area multiplication', () => {
    const result = calculateBoardsCost({
      material: 'FLEX',
      widthCm: 100,
      heightCm: 100,
      quantity: 2,
      settings: SETTINGS,
      pricePerMeterOverride: 30,
    });
    expect(result.pricePerMeter).toBe(30);
    expect(result.total).toBe(60); // 2m² * 30 (overridden), not the catalog 45
  });
});

// Owner (same day, "في نقطة لازم النسبة تكون موجودة بردو... ده وده وانا اختار")
// — an alternative to a flat override: a markup/markdown % on the resolved rate.
describe('calculateBoardsCost — pricePerMeterMarkupPercent', () => {
  it('applies the percentage on top of the resolved rate, not the total', () => {
    const markup = calculateBoardsCost({
      material: 'FLEX',
      widthCm: 100,
      heightCm: 100,
      quantity: 2,
      settings: SETTINGS,
      pricePerMeterMarkupPercent: 10,
    });
    expect(markup.pricePerMeter).toBeCloseTo(49.5, 5); // 45 * 1.10
    expect(markup.total).toBeCloseTo(99, 5); // 2m² * 49.5

    const discount = calculateBoardsCost({
      material: 'FLEX',
      widthCm: 100,
      heightCm: 100,
      quantity: 2,
      settings: SETTINGS,
      pricePerMeterMarkupPercent: -20,
    });
    expect(discount.pricePerMeter).toBe(36); // 45 * 0.80
  });

  it('a flat pricePerMeterOverride wins if both are somehow present', () => {
    const result = calculateBoardsCost({
      material: 'FLEX',
      widthCm: 100,
      heightCm: 100,
      quantity: 1,
      settings: SETTINGS,
      pricePerMeterOverride: 30,
      pricePerMeterMarkupPercent: 10,
    });
    expect(result.pricePerMeter).toBe(30);
  });
});
