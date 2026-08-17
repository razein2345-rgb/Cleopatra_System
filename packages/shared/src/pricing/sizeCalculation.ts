/**
 * FEATURE-007 M1 — sheet-count calculation core.
 *
 * Ports the size-tiering rules from `docs/AI/PRICING_ENGINE_SPEC.md`
 * §3.1-3.5 literally — these are confirmed business rules, not something to
 * improve on. This module computes ONLY how many blank sheets a job
 * consumes (needed for Inventory auto-deduction, FEATURE-007 M2); it does
 * not compute any price, cost, or print-run count. Those remain a future,
 * separate Pricing Engine milestone.
 *
 * Pure functions only — no DB/HTTP access. Callers pass in the
 * `SizeFamily`/`SizeFamilyEntry` data and the relevant `Setting` constants.
 */

import type { SheetBase } from '../schemas/sheetType.js';

export type JobKind = 'LOOSE_PAPER' | 'NOTEBOOK';
export type NotebookContentType = 'ORIGINAL_ONLY' | 'ORIGINAL_PLUS_COPIES';

export interface SizeFamilyEntryInput {
  label: string;
  piecesPerSheet: number;
}

export interface SizeFamilyInput {
  key: string;
  base: SheetBase;
  entries: SizeFamilyEntryInput[];
}

export interface TieringSettings {
  notebookThreshold: number;
  looseThreshold: number;
  wasteSheetsDefault: number;
}

export class SizeCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SizeCalculationError';
  }
}

/**
 * The tiering groups, exactly as confirmed in PRICING_ENGINE_SPEC.md §3.2 —
 * keyed against the `SizeFamily.key` values already seeded in `seed.ts`
 * ('Mirrors legacy DEFAULT_FAMILIES exactly'). `koshiaGayer` deliberately
 * has no group here: gayer sheets never tier (§3.4), handled separately.
 */
const TIERING_GROUPS: Record<
  string,
  { familyKey: string; below: string; above: string; aSeries?: boolean }
> = {
  g1: { familyKey: 'extra2', below: '20×30', above: '30×40' },
  g2: { familyKey: 'standard', below: '25×35', above: '35×50' },
  g3: { familyKey: 'extra1', below: '20×28', above: '28×40' },
  g4: { familyKey: 'gawab', below: '22×28', above: '28×42' },
  // Single fixed size, no real tiering (§3.2's own note on g5).
  g5: { familyKey: 'foolscap', below: '23×33', above: '23×33' },
  gA: { familyKey: 'aSeries', below: 'A4', above: 'A3', aSeries: true },
  // Owner-confirmed (2026-08-17) — extra3 had no group at all (a real gap,
  // not a deliberate omission), causing numbering to hard-crash for this
  // live, actively-used family. `below`/`above` follow the exact same
  // "3rd/4th entry of a 4-entry extra-style family" pattern already set by
  // g1/g3/g4 above (extra3's real entries: 11.5×20, 20×23, 20×25, 23×25).
  g6: { familyKey: 'extra3', below: '20×25', above: '23×25' },
};

const FAMILY_KEY_TO_GROUP: Record<string, string> = Object.fromEntries(
  Object.entries(TIERING_GROUPS).map(([groupKey, def]) => [def.familyKey, groupKey]),
);

/** Exposed for `costCalculation.ts` — the numbering rules (§3.3) are keyed by the same g1/g2/.../gA groups as the printing tiering rules (§3.2), not duplicated. */
export function getTieringGroupKey(familyKey: string): string | undefined {
  return FAMILY_KEY_TO_GROUP[familyKey];
}

export function parseAreaLabel(label: string): number | null {
  const match = /^([\d.]+)\s*[×xX]\s*([\d.]+)$/.exec(label);
  if (!match) return null;
  return parseFloat(match[1]) * parseFloat(match[2]);
}

export function findEntry(family: SizeFamilyInput, label: string): SizeFamilyEntryInput | undefined {
  return family.entries.find((entry) => entry.label === label);
}

export function findFamily(families: SizeFamilyInput[], familyKey: string): SizeFamilyInput {
  const family = families.find((f) => f.key === familyKey);
  if (!family) throw new SizeCalculationError(`Unknown size family: "${familyKey}"`);
  return family;
}

/**
 * Resolves the size a job actually gets produced on ("calc size") and the
 * repeat factor — how many copies of the real (customer-facing) size fit
 * per calc-size unit. This calc size and the internal breakdown must never
 * be shown to the customer (§5.3 of the spec) — only used internally
 * (Work Order / Inventory deduction).
 */
export function resolveCalcSize(params: {
  familyKey: string;
  realLabel: string;
  quantity: number;
  jobKind: JobKind;
  families: SizeFamilyInput[];
  settings: TieringSettings;
}): { calcLabel: string; repeat: number; calcPiecesPerSheet: number } {
  const family = findFamily(params.families, params.familyKey);
  const realEntry = findEntry(family, params.realLabel);
  if (!realEntry) {
    throw new SizeCalculationError(
      `Unknown size "${params.realLabel}" in family "${params.familyKey}"`,
    );
  }

  if (family.base === 'GAYER') {
    // §3.4 — gayer sheets never tier; repeat comes straight from the family table.
    return {
      calcLabel: params.realLabel,
      repeat: realEntry.piecesPerSheet,
      calcPiecesPerSheet: realEntry.piecesPerSheet,
    };
  }

  const groupKey = FAMILY_KEY_TO_GROUP[params.familyKey];
  if (!groupKey) {
    // No tiering group defined for this family — print at the requested size as-is.
    return { calcLabel: params.realLabel, repeat: 1, calcPiecesPerSheet: realEntry.piecesPerSheet };
  }
  const group = TIERING_GROUPS[groupKey];
  const threshold =
    params.jobKind === 'NOTEBOOK' ? params.settings.notebookThreshold : params.settings.looseThreshold;

  let calcLabel: string;
  if (group.aSeries) {
    // §3.2 — A-series special rule: A4's own threshold (10) is distinct from the group threshold.
    if (params.realLabel === 'A4') {
      calcLabel = params.quantity > 10 ? 'A3' : 'A4';
    } else if (params.realLabel === 'A3' || params.realLabel === 'A2' || params.realLabel === 'A1') {
      // Already at/above the tiered target — nothing to gain from tiering further.
      calcLabel = params.realLabel;
    } else {
      calcLabel = params.quantity >= threshold ? 'A3' : 'A4';
    }
  } else if (group.below === group.above) {
    calcLabel = group.below;
  } else {
    const realArea = parseAreaLabel(params.realLabel);
    const belowArea = parseAreaLabel(group.below);
    if (realArea === null || belowArea === null) {
      throw new SizeCalculationError(
        `Cannot parse area for tiering comparison: "${params.realLabel}" vs "${group.below}"`,
      );
    }
    // Real size already at/above this group's tiering size — print as requested, no tiering.
    calcLabel = realArea >= belowArea ? params.realLabel : params.quantity >= threshold ? group.above : group.below;
  }

  const calcEntry = findEntry(family, calcLabel);
  if (!calcEntry) {
    throw new SizeCalculationError(`Calc size "${calcLabel}" not found in family "${params.familyKey}"`);
  }

  let repeat: number;
  if (calcLabel === params.realLabel) {
    repeat = 1;
  } else if (group.aSeries) {
    // §3.3 — for A sizes, use the piece-count ratio directly.
    repeat = Math.round(realEntry.piecesPerSheet / calcEntry.piecesPerSheet);
  } else {
    const realArea = parseAreaLabel(params.realLabel);
    const calcArea = parseAreaLabel(calcLabel);
    if (realArea === null || calcArea === null) {
      throw new SizeCalculationError(
        `Cannot parse area for repeat calculation: "${calcLabel}" / "${params.realLabel}"`,
      );
    }
    repeat = Math.round(calcArea / realArea);
  }

  return { calcLabel, repeat, calcPiecesPerSheet: calcEntry.piecesPerSheet };
}

/** §3.4 — loose paper sheet count (blank-paper consumption). */
export function computeLooseSheetsNeeded(params: {
  familyKey: string;
  realLabel: string;
  quantity: number;
  families: SizeFamilyInput[];
  settings: TieringSettings;
}): number {
  const family = findFamily(params.families, params.familyKey);

  if (family.base === 'GAYER') {
    const { repeat } = resolveCalcSize({ ...params, jobKind: 'LOOSE_PAPER' });
    return Math.ceil(params.quantity / repeat) + params.settings.wasteSheetsDefault;
  }

  const { repeat, calcPiecesPerSheet } = resolveCalcSize({ ...params, jobKind: 'LOOSE_PAPER' });
  const units = params.quantity / repeat;
  return Math.ceil(units / calcPiecesPerSheet) + params.settings.wasteSheetsDefault;
}

/** §3.5 — notebook sheet count (blank-paper consumption only, not print-run cost). */
export function computeNotebookSheetsNeeded(params: {
  familyKey: string;
  realLabel: string;
  notebookQuantity: number;
  contentType: NotebookContentType;
  copies?: number;
  families: SizeFamilyInput[];
  settings: TieringSettings;
}): number {
  const sheetsPerNotebook =
    params.contentType === 'ORIGINAL_ONLY' ? 100 : 50 + 50 * (params.copies ?? 0);
  const totalSheetsFlat = params.notebookQuantity * sheetsPerNotebook;

  // The tiering threshold compares against the notebook count itself, not
  // the expanded flat-sheet total — confirmed by the worked example
  // (100 notebooks >= threshold 30), see PRICING_ENGINE_SPEC.md §3.5.
  const { repeat, calcPiecesPerSheet } = resolveCalcSize({
    familyKey: params.familyKey,
    realLabel: params.realLabel,
    quantity: params.notebookQuantity,
    jobKind: 'NOTEBOOK',
    families: params.families,
    settings: params.settings,
  });

  const units = totalSheetsFlat / repeat;
  return Math.ceil(units / calcPiecesPerSheet) + params.settings.wasteSheetsDefault;
}
