import type { Prisma } from '../generated/prisma/client.js';
import type { BoardsPricingConstants, BoardsSupplierPricingConstants, DigitalColorMode, DigitalPrintBasis, DigitalSides, OrderItemPricingInput, PricingConstants } from '@cleopatra/shared';
import {
  calculateBoardsCost,
  calculateDigitalMultiComponentCost,
  calculateEnvelopeCost,
  calculateFolderCost,
  calculateLoosePaperCost,
  calculateNotebookMultiMaterialCost,
  calculateProductOrServiceCost,
  type DigitalComponentInput,
  type DigitalPriceTier,
  type DigitalPricingConstants,
  type NotebookMaterialOverride,
  type SizeFamilyInput,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

/** Owner (2026-08-20) — one of the 12 admin-managed `DigitalPriceTier` tables (basis × colorMode × sides); shared between `buildPricingContext` (which fetches and groups every row once) and the DIGITAL dispatch case (which looks a specific combination back up), so the two never drift on how a combination is identified. */
function digitalTierTableKey(basis: DigitalPrintBasis, colorMode: DigitalColorMode, sides: DigitalSides): string {
  return `${basis}|${colorMode}|${sides}`;
}

/**
 * FEATURE-007 — extracted out of `orderService.ts` (PE-E) so
 * `quotationService.ts` can dispatch through the exact same pricing
 * engine — the owner's explicit clarification (2026-08-10) that Quotation
 * creation is NOT a separate flow, it's the same unified creation screen
 * saving as a different document type. One dispatch point, one set of
 * reference-data lookups, never two.
 */

export class PricingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingInputError';
  }
}

export interface PricingContext {
  families: SizeFamilyInput[];
  pricingConstants: PricingConstants;
  boardsConstants: BoardsPricingConstants;
  boardsSupplierConstants: BoardsSupplierPricingConstants;
  digitalConstants: DigitalPricingConstants;
  vatRate: number;
  sheetPriceByInventoryItemId: Map<string, number>;
  /** Frozen into `breakdown` at creation time (same "freeze by default" discipline as `modelName`) so a later paper rename never changes what an already-printed Work Order shows it used. */
  paperNameByInventoryItemId: Map<string, string>;
  catalogPriceById: Map<string, number>;
  /** `INVENTORY_RETAIL` items only (§ held-stock ready-made merchandise) — `InventoryItem.salePrice`, distinct from `sheetPriceByInventoryItemId` (a paper/sheet cost input, never a direct sale price). */
  salePriceByInventoryItemId: Map<string, number>;
  /** Owner (2026-08-20) — every `DigitalPriceTier` row, grouped by `digitalTierTableKey`. Always fetched in full (12 small tables, cheap) rather than filtered to just the items being priced, since a caller with zero DIGITAL items simply never looks this map up. */
  digitalPriceTiersByKey: Map<string, DigitalPriceTier[]>;
}

type SettingRecord = Prisma.SettingGetPayload<object>;
type SizeFamilyWithEntries = Prisma.SizeFamilyGetPayload<{ include: { entries: true } }>;

/**
 * Exported so `pricingReference.ts` (the read-only endpoint that hands the
 * client the same constants for its own live preview) builds its response
 * from this single mapping too — never a second, hand-copied field list
 * that could drift from this one.
 */
export function mapSettingToPricingConstants(setting: SettingRecord): PricingConstants {
  return {
    notebookThreshold: setting.notebookThreshold,
    looseThreshold: setting.looseThreshold,
    wasteSheetsDefault: setting.wasteSheetsDefault,
    zincPrice: setting.zincPrice.toNumber(),
    printRunPrice: setting.printRunPrice.toNumber(),
    numberingRunPrice: setting.numberingRunPrice.toNumber(),
    designPrice: setting.designPrice.toNumber(),
    profitPercent: setting.profitPercent.toNumber(),
    envelopeDesignPrice: setting.envelopeDesignPrice.toNumber(),
    envelopeZincPrice: setting.envelopeZincPrice.toNumber(),
    envelopePrintRunPrice: setting.envelopePrintRunPrice.toNumber(),
    sellophanePricePerSheet: setting.sellophanePricePerSheet.toNumber(),
  };
}

export function mapSettingToBoardsPricingConstants(setting: SettingRecord): BoardsPricingConstants {
  return {
    boardsBannerNoDesign: setting.boardsBannerNoDesign.toNumber(),
    boardsBannerWithDesign: setting.boardsBannerWithDesign.toNumber(),
    boardsVinylNormalNoSello: setting.boardsVinylNormalNoSello.toNumber(),
    boardsVinylNormalWithSello: setting.boardsVinylNormalWithSello.toNumber(),
    boardsVinylPrintCutNoSello: setting.boardsVinylPrintCutNoSello.toNumber(),
    boardsVinylPrintCutWithSello: setting.boardsVinylPrintCutWithSello.toNumber(),
    boardsFlex: setting.boardsFlex.toNumber(),
    boardsSeasro: setting.boardsSeasro.toNumber(),
    boardsGapMM: setting.boardsGapMM.toNumber(),
  };
}

/** Owner (2026-08-26) — part 4 of the treasury/suppliers initiative; see boardsCostCalculation.ts's `BoardsSupplierPricingConstants` doc comment. */
export function mapSettingToBoardsSupplierPricingConstants(setting: SettingRecord): BoardsSupplierPricingConstants {
  return {
    boardsBannerSupplierCost: setting.boardsBannerSupplierCost.toNumber(),
    boardsVinylNormalSupplierCost: setting.boardsVinylNormalSupplierCost.toNumber(),
    boardsVinylPrintCutSupplierCost: setting.boardsVinylPrintCutSupplierCost.toNumber(),
    boardsFlexSupplierCost: setting.boardsFlexSupplierCost.toNumber(),
    boardsSeasroSupplierCost: setting.boardsSeasroSupplierCost.toNumber(),
  };
}

/** `digitalPrintPricePerQuarter` (Setting column) is deliberately no longer read here — superseded 2026-08-20 by the `DigitalPriceTier` quantity-tier tables (see digitalCostCalculation.ts's doc comment); the column itself stays (rule 2, no deletion without an explicit ask), just unused by the pricing engine from now on. */
export function mapSettingToDigitalPricingConstants(setting: SettingRecord): DigitalPricingConstants {
  return {
    digitalSellophanePricePerQuarter: setting.digitalSellophanePricePerQuarter.toNumber(),
    digitalQuarterWidthCm: setting.digitalQuarterWidthCm.toNumber(),
    digitalQuarterHeightCm: setting.digitalQuarterHeightCm.toNumber(),
    profitPercent: setting.profitPercent.toNumber(),
    wasteSheetsDefault: setting.wasteSheetsDefault,
  };
}

export function mapSizeFamilyToInput(family: SizeFamilyWithEntries): SizeFamilyInput {
  return {
    key: family.key,
    base: family.base,
    entries: family.entries.map((e) => ({ label: e.label, piecesPerSheet: e.piecesPerSheet.toNumber() })),
  };
}

/** The minimal shape any Order/Quotation item input needs for pricing — both `createOrderItemSchema` and `createQuotationItemSchema` satisfy this structurally. */
export interface PricingLineItem {
  pricing: OrderItemPricingInput;
  readyProductId?: string | null;
  serviceId?: string | null;
}

/**
 * One read-only reference-data load per creation call, not one per item:
 * `SizeFamily`/`Setting` (needed by any sheet-consuming item), the
 * specific `InventoryItem`→`SheetType` prices and `ReadyProduct`/`Service`
 * catalog prices the submitted items actually reference. Safe to run
 * outside the caller's write transaction — this is read-only reference data.
 */
export async function buildPricingContext(items: PricingLineItem[]): Promise<PricingContext> {
  const needsSizeFamilies = items.some(
    (i) => i.pricing.kind === 'LOOSE_PAPER' || i.pricing.kind === 'NOTEBOOK' || i.pricing.kind === 'FOLDER',
  );
  const needsDigitalTiers = items.some((i) => i.pricing.kind === 'DIGITAL');

  const inventoryItemIds = [
    ...new Set(
      items.flatMap((i) => {
        const ids: (string | null | undefined)[] = ['inventoryItemId' in i.pricing ? i.pricing.inventoryItemId : null];
        if (i.pricing.kind === 'NOTEBOOK') ids.push(...(i.pricing.materials ?? []).map((m) => m.inventoryItemId));
        if (i.pricing.kind === 'DIGITAL') ids.push(...i.pricing.components.map((c) => c.inventoryItemId));
        return ids.filter((id): id is string => Boolean(id));
      }),
    ),
  ];
  const catalogIds = [
    ...new Set(
      items
        .filter((i) => i.pricing.kind === 'PRODUCT' || i.pricing.kind === 'SERVICE')
        .map((i) => i.readyProductId ?? i.serviceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [setting, families, inventoryItems, readyProducts, services, digitalPriceTiers] = await Promise.all([
    prisma.setting.findFirstOrThrow(),
    needsSizeFamilies
      ? prisma.sizeFamily.findMany({ where: { isDeleted: false }, include: { entries: true } })
      : Promise.resolve([]),
    inventoryItemIds.length
      ? prisma.inventoryItem.findMany({ where: { id: { in: inventoryItemIds } }, include: { sheetType: true } })
      : Promise.resolve([]),
    catalogIds.length
      ? prisma.readyProduct.findMany({ where: { id: { in: catalogIds } }, select: { id: true, price: true } })
      : Promise.resolve([]),
    catalogIds.length
      ? prisma.service.findMany({ where: { id: { in: catalogIds } }, select: { id: true, price: true } })
      : Promise.resolve([]),
    needsDigitalTiers ? prisma.digitalPriceTier.findMany() : Promise.resolve([]),
  ]);

  const sheetPriceByInventoryItemId = new Map<string, number>();
  const paperNameByInventoryItemId = new Map<string, string>();
  const salePriceByInventoryItemId = new Map<string, number>();
  for (const ii of inventoryItems) {
    if (ii.sheetType) sheetPriceByInventoryItemId.set(ii.id, ii.sheetType.price.toNumber());
    paperNameByInventoryItemId.set(ii.id, ii.name);
    if (ii.salePrice) salePriceByInventoryItemId.set(ii.id, ii.salePrice.toNumber());
  }

  const catalogPriceById = new Map<string, number>();
  for (const p of readyProducts) catalogPriceById.set(p.id, p.price.toNumber());
  for (const s of services) catalogPriceById.set(s.id, s.price.toNumber());

  const digitalPriceTiersByKey = new Map<string, DigitalPriceTier[]>();
  for (const tier of digitalPriceTiers) {
    const key = digitalTierTableKey(tier.basis, tier.colorMode, tier.sides);
    const list = digitalPriceTiersByKey.get(key);
    const entry = { minQuantity: tier.minQuantity, pricePerUnit: tier.pricePerUnit.toNumber() };
    if (list) list.push(entry);
    else digitalPriceTiersByKey.set(key, [entry]);
  }

  return {
    families: families.map(mapSizeFamilyToInput),
    pricingConstants: mapSettingToPricingConstants(setting),
    boardsConstants: mapSettingToBoardsPricingConstants(setting),
    boardsSupplierConstants: mapSettingToBoardsSupplierPricingConstants(setting),
    digitalConstants: mapSettingToDigitalPricingConstants(setting),
    vatRate: setting.vatRate.toNumber(),
    sheetPriceByInventoryItemId,
    paperNameByInventoryItemId,
    catalogPriceById,
    salePriceByInventoryItemId,
    digitalPriceTiersByKey,
  };
}

export interface ItemPricingMaterial {
  role: string;
  inventoryItemId: string;
  sheetsNeeded: number;
  sheetPrice: number;
  paperName: string | null;
}

export interface ItemPricingResult {
  total: number;
  breakdown: Prisma.InputJsonValue;
  sheetsNeeded: number | null;
  inventoryItemId: string | null;
  sizeFamilyKey: string | null;
  realSizeLabel: string | null;
  /**
   * Multi-material pricing (2026-08-17) — NOTEBOOK/DIGITAL only. When
   * present, this is the authoritative list of (material, quantity) pairs
   * to deduct/restock — `orderService.ts`'s `materialsToDeduct` helper
   * prefers this over `inventoryItemId`/`sheetsNeeded` above (which stay
   * `null` for these two kinds). Every other kind leaves this `undefined`
   * and keeps using the singular fields, untouched.
   */
  materials?: ItemPricingMaterial[];
}

/** Sums the manual "خدمات إضافية" amounts (owner-managed catalog — see orderItemPricing.ts's own doc comment). Never a fixed price, always caller-entered. */
function sumExtraCosts(pricing: { extraServices?: { label: string; amount: number }[] }): number {
  return (pricing.extraServices ?? []).reduce((sum, s) => sum + s.amount, 0);
}

/**
 * Owner (2026-08-26, "أكتب السعر النهائي يدويًا للصنف ده"، same day: "في
 * نقطة لازم النسبة تكون موجودة بردو... ده وده وانا اختار") — BOARDS/
 * PRODUCT/SERVICE/INVENTORY_RETAIL's manual price override, two mutually
 * exclusive modes: a flat replacement price, or a markup/markdown
 * percentage applied on top of the catalog/computed base. `override`
 * takes priority if both are somehow present (shouldn't happen — the
 * composer UI only ever sends one).
 */
function resolveOverriddenUnitPrice(base: number | undefined, override: number | undefined, markupPercent: number | undefined): number | undefined {
  if (override !== undefined) return override;
  if (markupPercent !== undefined && base !== undefined) return base * (1 + markupPercent / 100);
  return base;
}

/**
 * The single dispatch point from a validated `OrderItemPricingInput` to a
 * real pricing-engine result — never trusts a client-supplied total (see
 * `orderItemPricing.ts`'s own doc comment). One `switch` arm per kind,
 * each calling straight into the pure functions in
 * `packages/shared/src/pricing/*` with real reference data resolved by
 * `buildPricingContext` above.
 *
 * `zincPriceOverride`/`printRunPriceOverride`/`profitPercentOverride` are the
 * owner-approved manual-override fields (2026-08-10) — threaded straight
 * through to the pure functions, which already know how to apply them.
 */
export function computeItemPricing(item: PricingLineItem, ctx: PricingContext): ItemPricingResult {
  const pricing = item.pricing;

  switch (pricing.kind) {
    case 'LOOSE_PAPER': {
      const sheetPrice = pricing.sheetPriceOverride ?? ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
      if (sheetPrice === undefined) {
        throw new PricingInputError(`Inventory item "${pricing.inventoryItemId}" has no linked sheet price`);
      }
      const result = calculateLoosePaperCost({
        familyKey: pricing.sizeFamilyKey,
        realLabel: pricing.realSizeLabel,
        quantity: pricing.quantity,
        colorCount: pricing.colorCount,
        sides: pricing.sides,
        isNewDesign: pricing.isNewDesign,
        numbering: pricing.numberingStartNumber ? { startNumber: pricing.numberingStartNumber } : undefined,
        sheetPrice,
        families: ctx.families,
        settings: ctx.pricingConstants,
        zincPriceOverride: pricing.zincPriceOverride,
        printRunPriceOverride: pricing.printRunPriceOverride,
        numberingRunPriceOverride: pricing.numberingRunPriceOverride,
        designCostOverride: pricing.designCostOverride,
        wasteSheetsOverride: pricing.wasteSheetsOverride,
        calcSizeOverride: pricing.calcSizeOverride,
        numberingSizeOverride: pricing.numberingSizeOverride,
        profitPercentOverride: pricing.profitPercentOverride,
        extraCosts: sumExtraCosts(pricing),
        paperCostOverride: pricing.paperCostOverride,
      });
      return {
        total: result.total,
        // `quantity` (the customer-facing piece count) is merged in here
        // — not part of the pricing engine's own result shape, but needed
        // by document printing (DocumentRenderer) so an invoice can show
        // what was ordered without exposing internal figures like
        // `sheetsNeeded` (§5.3 — internal calc never shown to the customer).
        // The rest (colorCount/sides/isNewDesign/numberingStartNumber/
        // paperName) are `pricing` INPUT fields, not part of the pricing
        // engine's own result — merged in for the same reason `quantity`
        // is: the Offset Work Order document (§4) needs them and nothing
        // else keeps them once this transaction commits.
        breakdown: {
          ...result,
          quantity: pricing.quantity,
          colorCount: pricing.colorCount,
          sides: pricing.sides,
          isNewDesign: pricing.isNewDesign,
          numberingStartNumber: pricing.numberingStartNumber ?? null,
          paperName: ctx.paperNameByInventoryItemId.get(pricing.inventoryItemId) ?? null,
        } as unknown as Prisma.InputJsonValue,
        sheetsNeeded: result.sheetsNeeded,
        inventoryItemId: pricing.inventoryItemId,
        sizeFamilyKey: pricing.sizeFamilyKey,
        realSizeLabel: pricing.realSizeLabel,
      };
    }
    case 'NOTEBOOK': {
      const sheetPrice = pricing.sheetPriceOverride ?? ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
      if (sheetPrice === undefined) {
        throw new PricingInputError(`Inventory item "${pricing.inventoryItemId}" has no linked sheet price`);
      }
      // Multi-material (2026-08-17) — resolves each copy's own sheet price
      // when overridden (owner: "هختار نوع الورق لكل نسخة", so any number
      // of copies can each get their own independently-chosen paper); the
      // original's `sheetPrice` above is what `calculateNotebookMultiMaterialCost`
      // falls back to for any copy without an override.
      const inventoryItemIdByRole: Record<string, string> = { ORIGINAL: pricing.inventoryItemId };
      const materialOverrides: NotebookMaterialOverride[] = (pricing.materials ?? []).map((m) => {
        // Owner (2026-08-26, "عايز اغير سعر أفرخ الصور... مفيش غير سعر
        // ورق الأصل فقط هو اللي اقدر اغيره") — same per-copy override as
        // the original's own sheetPriceOverride above.
        const overridePrice = m.sheetPriceOverride ?? ctx.sheetPriceByInventoryItemId.get(m.inventoryItemId);
        if (overridePrice === undefined) {
          throw new PricingInputError(`Inventory item "${m.inventoryItemId}" has no linked sheet price`);
        }
        inventoryItemIdByRole[m.role] = m.inventoryItemId;
        return { role: m.role, sheetPrice: overridePrice };
      });

      const result = calculateNotebookMultiMaterialCost(
        {
          familyKey: pricing.sizeFamilyKey,
          realLabel: pricing.realSizeLabel,
          notebookQuantity: pricing.notebookQuantity,
          contentType: pricing.contentType,
          copies: pricing.copies,
          colorCount: pricing.colorCount,
          isNewDesign: pricing.isNewDesign,
          numbering: pricing.numberingStartNumber ? { startNumber: pricing.numberingStartNumber } : undefined,
          bindingPricePerNotebook: pricing.bindingPricePerNotebook,
          sheetPrice,
          families: ctx.families,
          settings: ctx.pricingConstants,
          zincPriceOverride: pricing.zincPriceOverride,
          printRunPriceOverride: pricing.printRunPriceOverride,
          numberingRunPriceOverride: pricing.numberingRunPriceOverride,
          designCostOverride: pricing.designCostOverride,
          wasteSheetsOverride: pricing.wasteSheetsOverride,
          calcSizeOverride: pricing.calcSizeOverride,
          numberingSizeOverride: pricing.numberingSizeOverride,
          originalPagesOverride: pricing.originalPagesOverride,
          copyPagesOverride: pricing.copyPagesOverride,
          profitPercentOverride: pricing.profitPercentOverride,
          extraCosts: sumExtraCosts(pricing),
          paperCostOverride: pricing.paperCostOverride,
        },
        materialOverrides.length ? materialOverrides : undefined,
      );

      const materials: ItemPricingMaterial[] = result.materials.map((m) => {
        const invId = inventoryItemIdByRole[m.role] ?? pricing.inventoryItemId;
        return {
          role: m.role,
          inventoryItemId: invId,
          sheetsNeeded: m.sheetsNeeded,
          sheetPrice: m.sheetPrice,
          paperName: ctx.paperNameByInventoryItemId.get(invId) ?? null,
        };
      });

      return {
        total: result.total,
        breakdown: {
          ...result,
          quantity: pricing.notebookQuantity,
          colorCount: pricing.colorCount,
          isNewDesign: pricing.isNewDesign,
          numberingStartNumber: pricing.numberingStartNumber ?? null,
          contentType: pricing.contentType,
          copies: pricing.copies ?? null,
          paperName: ctx.paperNameByInventoryItemId.get(pricing.inventoryItemId) ?? null,
          materials,
        } as unknown as Prisma.InputJsonValue,
        sheetsNeeded: null,
        inventoryItemId: null,
        sizeFamilyKey: pricing.sizeFamilyKey,
        realSizeLabel: pricing.realSizeLabel,
        materials,
      };
    }
    case 'ENVELOPE': {
      const result = calculateEnvelopeCost({
        quantity: pricing.quantity,
        colorCount: pricing.colorCount,
        isNewDesign: pricing.isNewDesign,
        readyEnvelopePricePerPiece: pricing.readyEnvelopePricePerPiece,
        settings: ctx.pricingConstants,
        zincPriceOverride: pricing.zincPriceOverride,
        printRunPriceOverride: pricing.printRunPriceOverride,
        designCostOverride: pricing.designCostOverride,
        profitPercentOverride: pricing.profitPercentOverride,
        extraCosts: sumExtraCosts(pricing),
      });
      return {
        total: result.total,
        breakdown: {
          ...result,
          quantity: pricing.quantity,
          colorCount: pricing.colorCount,
          isNewDesign: pricing.isNewDesign,
          readyEnvelopePricePerPiece: pricing.readyEnvelopePricePerPiece,
        } as unknown as Prisma.InputJsonValue,
        sheetsNeeded: null,
        inventoryItemId: null,
        sizeFamilyKey: null,
        realSizeLabel: null,
      };
    }
    case 'FOLDER': {
      const sheetPrice = pricing.sheetPriceOverride ?? ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
      if (sheetPrice === undefined) {
        throw new PricingInputError(`Inventory item "${pricing.inventoryItemId}" has no linked sheet price`);
      }
      const result = calculateFolderCost({
        familyKey: pricing.sizeFamilyKey,
        realLabel: pricing.realSizeLabel,
        quantity: pricing.quantity,
        colorCount: pricing.colorCount,
        sides: pricing.sides,
        isNewDesign: pricing.isNewDesign,
        sheetPrice,
        sellophaneEnabled: pricing.sellophaneEnabled,
        riza: pricing.riza,
        jarab: pricing.jarab,
        forma: pricing.forma,
        taksir: pricing.taksir,
        families: ctx.families,
        settings: ctx.pricingConstants,
        zincPriceOverride: pricing.zincPriceOverride,
        printRunPriceOverride: pricing.printRunPriceOverride,
        designCostOverride: pricing.designCostOverride,
        wasteSheetsOverride: pricing.wasteSheetsOverride,
        calcSizeOverride: pricing.calcSizeOverride,
        profitPercentOverride: pricing.profitPercentOverride,
        extraCosts: sumExtraCosts(pricing),
        paperCostOverride: pricing.paperCostOverride,
      });
      return {
        total: result.total,
        breakdown: {
          ...result,
          quantity: pricing.quantity,
          colorCount: pricing.colorCount,
          sides: pricing.sides,
          isNewDesign: pricing.isNewDesign,
          sellophaneEnabled: pricing.sellophaneEnabled,
          paperName: ctx.paperNameByInventoryItemId.get(pricing.inventoryItemId) ?? null,
        } as unknown as Prisma.InputJsonValue,
        sheetsNeeded: result.sheetsNeeded,
        inventoryItemId: pricing.inventoryItemId,
        sizeFamilyKey: pricing.sizeFamilyKey,
        realSizeLabel: pricing.realSizeLabel,
      };
    }
    case 'DIGITAL': {
      // Multi-component (2026-08-17) — each component (cover/interior/...)
      // is priced fully independently, then summed. A plain single-item
      // digital job is just `components.length === 1`, which
      // `calculateDigitalMultiComponentCost` returns byte-identical to a
      // direct `calculateDigitalCost` call (see that function's doc comment
      // for the algebraic proof).
      const componentInputs: DigitalComponentInput[] = pricing.components.map((c) => {
        const sheetPrice = ctx.sheetPriceByInventoryItemId.get(c.inventoryItemId);
        if (sheetPrice === undefined) {
          throw new PricingInputError(`Inventory item "${c.inventoryItemId}" has no linked sheet price`);
        }
        // Owner (2026-08-20) — each component picks its own one of the 12
        // admin-managed tier tables; a combination with zero tiers defined
        // yet fails loudly inside calculateDigitalCost (findTierPrice),
        // not silently as a free item.
        const printTiers = ctx.digitalPriceTiersByKey.get(digitalTierTableKey(c.printBasis, c.colorMode, c.sides)) ?? [];
        return {
          label: c.label,
          inventoryItemId: c.inventoryItemId,
          printBasis: c.printBasis,
          colorMode: c.colorMode,
          sides: c.sides,
          printTiers,
          pieceWidthCm: c.pieceWidthCm,
          pieceHeightCm: c.pieceHeightCm,
          quantity: c.quantity,
          yieldPerQuarter: c.yieldPerQuarter,
          sheetPrice,
          sellophaneEnabled: c.sellophaneEnabled,
          boshrPricePerPiece: c.boshrPricePerPiece,
          settings: ctx.digitalConstants,
          profitPercentOverride: pricing.profitPercentOverride,
          extraCosts: sumExtraCosts(pricing),
        };
      });

      const result = calculateDigitalMultiComponentCost(componentInputs);

      // Echoes each component's own input fields back alongside its result
      // (same "input fields aren't part of the pure function's own result,
      // merge them in for printing/reconstruction" pattern every other kind
      // above already uses) — `NewOrderPage.tsx`'s edit-reconstruction path
      // reads this full `components` list, not just `materials` below.
      const componentsBreakdown = result.components.map((rc, idx) => ({
        ...rc,
        printBasis: componentInputs[idx].printBasis,
        colorMode: componentInputs[idx].colorMode,
        sides: componentInputs[idx].sides,
        pieceWidthCm: componentInputs[idx].pieceWidthCm,
        pieceHeightCm: componentInputs[idx].pieceHeightCm,
        yieldPerQuarter: componentInputs[idx].yieldPerQuarter ?? null,
        sellophaneEnabled: componentInputs[idx].sellophaneEnabled ?? null,
        boshrPricePerPiece: componentInputs[idx].boshrPricePerPiece ?? null,
        paperName: ctx.paperNameByInventoryItemId.get(rc.inventoryItemId) ?? null,
      }));

      const materials: ItemPricingMaterial[] = componentsBreakdown.map((c, idx) => ({
        role: c.label,
        inventoryItemId: c.inventoryItemId,
        sheetsNeeded: c.sheetsNeeded,
        sheetPrice: componentInputs[idx].sheetPrice,
        paperName: c.paperName,
      }));

      return {
        total: result.total,
        breakdown: {
          total: result.total,
          subtotal: result.subtotal,
          extraCosts: result.extraCosts,
          profitPercentUsed: result.profitPercentUsed,
          components: componentsBreakdown,
        } as unknown as Prisma.InputJsonValue,
        sheetsNeeded: null,
        inventoryItemId: null,
        sizeFamilyKey: null,
        realSizeLabel: null,
        materials,
      };
    }
    case 'BOARDS': {
      const result = calculateBoardsCost({
        material: pricing.material,
        widthCm: pricing.widthCm,
        heightCm: pricing.heightCm,
        quantity: pricing.quantity,
        hasDesign: pricing.hasDesign,
        hasSellophane: pricing.hasSellophane,
        settings: ctx.boardsConstants,
        supplierSettings: ctx.boardsSupplierConstants,
        extraCosts: sumExtraCosts(pricing),
        pricePerMeterOverride: pricing.pricePerMeterOverride,
        pricePerMeterMarkupPercent: pricing.pricePerMeterMarkupPercent,
      });
      return {
        total: result.total,
        breakdown: {
          ...result,
          quantity: pricing.quantity,
          material: pricing.material,
          widthCm: pricing.widthCm,
          heightCm: pricing.heightCm,
          hasDesign: pricing.hasDesign ?? null,
          hasSellophane: pricing.hasSellophane ?? null,
        } as unknown as Prisma.InputJsonValue,
        sheetsNeeded: null,
        inventoryItemId: null,
        sizeFamilyKey: null,
        realSizeLabel: null,
      };
    }
    case 'INVENTORY_RETAIL': {
      const unitPrice = resolveOverriddenUnitPrice(
        ctx.salePriceByInventoryItemId.get(pricing.inventoryItemId),
        pricing.unitPriceOverride,
        pricing.unitPriceMarkupPercent,
      );
      if (unitPrice === undefined) {
        throw new PricingInputError(`Inventory item "${pricing.inventoryItemId}" has no sale price set`);
      }
      const extraCosts = sumExtraCosts(pricing);
      const total = calculateProductOrServiceCost(unitPrice, pricing.quantity, extraCosts);
      return {
        total,
        breakdown: {
          kind: pricing.kind,
          unitPrice,
          quantity: pricing.quantity,
          extraCosts,
          total,
          itemName: ctx.paperNameByInventoryItemId.get(pricing.inventoryItemId) ?? null,
        } as unknown as Prisma.InputJsonValue,
        // Same generic path LOOSE_PAPER/DIGITAL/... already use — no new
        // deduction code needed, just a plain piece count instead of a
        // sheets-based formula result.
        sheetsNeeded: pricing.quantity,
        inventoryItemId: pricing.inventoryItemId,
        sizeFamilyKey: null,
        realSizeLabel: null,
      };
    }
    case 'PRODUCT':
    case 'SERVICE': {
      const catalogId = item.readyProductId ?? item.serviceId;
      if (!catalogId) {
        throw new PricingInputError(`A ${pricing.kind} item requires readyProductId or serviceId`);
      }
      const unitPrice = resolveOverriddenUnitPrice(ctx.catalogPriceById.get(catalogId), pricing.unitPriceOverride, pricing.unitPriceMarkupPercent);
      if (unitPrice === undefined) {
        throw new PricingInputError(`No catalog price found for "${catalogId}"`);
      }
      const extraCosts = sumExtraCosts(pricing);
      const total = calculateProductOrServiceCost(unitPrice, pricing.quantity, extraCosts);
      return {
        total,
        breakdown: { kind: pricing.kind, unitPrice, quantity: pricing.quantity, extraCosts, total },
        sheetsNeeded: null,
        inventoryItemId: null,
        sizeFamilyKey: null,
        realSizeLabel: null,
      };
    }
    // Owner (2026-08-20, "اقدر ازود على الفاتورة حركة اكتبها يدوي زي
    // حركات الخزينة") — no formula, no catalog: the caller-typed
    // unitPrice × quantity *is* the total.
    case 'MANUAL': {
      const total = pricing.unitPrice * pricing.quantity;
      return {
        total,
        breakdown: { kind: pricing.kind, unitPrice: pricing.unitPrice, quantity: pricing.quantity, total },
        sheetsNeeded: null,
        inventoryItemId: null,
        sizeFamilyKey: null,
        realSizeLabel: null,
      };
    }
  }
}
