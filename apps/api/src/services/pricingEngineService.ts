import type { Prisma } from '../generated/prisma/client.js';
import type { BoardsPricingConstants, OrderItemPricingInput, PricingConstants } from '@cleopatra/shared';
import {
  calculateBoardsCost,
  calculateDigitalCost,
  calculateEnvelopeCost,
  calculateFolderCost,
  calculateLoosePaperCost,
  calculateNotebookCost,
  calculateProductOrServiceCost,
  type DigitalPricingConstants,
  type SizeFamilyInput,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

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
  digitalConstants: DigitalPricingConstants;
  vatRate: number;
  sheetPriceByInventoryItemId: Map<string, number>;
  /** Frozen into `breakdown` at creation time (same "freeze by default" discipline as `modelName`) so a later paper rename never changes what an already-printed Work Order shows it used. */
  paperNameByInventoryItemId: Map<string, string>;
  catalogPriceById: Map<string, number>;
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

export function mapSettingToDigitalPricingConstants(setting: SettingRecord): DigitalPricingConstants {
  return {
    digitalPrintPricePerQuarter: setting.digitalPrintPricePerQuarter.toNumber(),
    digitalSellophanePricePerQuarter: setting.digitalSellophanePricePerQuarter.toNumber(),
    digitalQuarterWidthCm: setting.digitalQuarterWidthCm.toNumber(),
    digitalQuarterHeightCm: setting.digitalQuarterHeightCm.toNumber(),
    profitPercent: setting.profitPercent.toNumber(),
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

  const inventoryItemIds = [
    ...new Set(
      items
        .map((i) => ('inventoryItemId' in i.pricing ? i.pricing.inventoryItemId : null))
        .filter((id): id is string => Boolean(id)),
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

  const [setting, families, inventoryItems, readyProducts, services] = await Promise.all([
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
  ]);

  const sheetPriceByInventoryItemId = new Map<string, number>();
  const paperNameByInventoryItemId = new Map<string, string>();
  for (const ii of inventoryItems) {
    if (ii.sheetType) sheetPriceByInventoryItemId.set(ii.id, ii.sheetType.price.toNumber());
    paperNameByInventoryItemId.set(ii.id, ii.name);
  }

  const catalogPriceById = new Map<string, number>();
  for (const p of readyProducts) catalogPriceById.set(p.id, p.price.toNumber());
  for (const s of services) catalogPriceById.set(s.id, s.price.toNumber());

  return {
    families: families.map(mapSizeFamilyToInput),
    pricingConstants: mapSettingToPricingConstants(setting),
    boardsConstants: mapSettingToBoardsPricingConstants(setting),
    digitalConstants: mapSettingToDigitalPricingConstants(setting),
    vatRate: setting.vatRate.toNumber(),
    sheetPriceByInventoryItemId,
    paperNameByInventoryItemId,
    catalogPriceById,
  };
}

export interface ItemPricingResult {
  total: number;
  breakdown: Prisma.InputJsonValue;
  sheetsNeeded: number | null;
  inventoryItemId: string | null;
  sizeFamilyKey: string | null;
  realSizeLabel: string | null;
}

/** Sums the four manual "خدمات إضافية" amounts (bagging/adhesive/sample) — see orderItemPricing.ts's own doc comment. Never a fixed price, always caller-entered. */
function sumExtraCosts(pricing: {
  baggingAmount?: number;
  singleAdhesiveAmount?: number;
  doubleAdhesiveAmount?: number;
  sampleAmount?: number;
}): number {
  return (
    (pricing.baggingAmount ?? 0) +
    (pricing.singleAdhesiveAmount ?? 0) +
    (pricing.doubleAdhesiveAmount ?? 0) +
    (pricing.sampleAmount ?? 0)
  );
}

/**
 * The single dispatch point from a validated `OrderItemPricingInput` to a
 * real pricing-engine result — never trusts a client-supplied total (see
 * `orderItemPricing.ts`'s own doc comment). One `switch` arm per kind,
 * each calling straight into the pure functions in
 * `packages/shared/src/pricing/*` with real reference data resolved by
 * `buildPricingContext` above.
 *
 * `zincCostOverride`/`printCostOverride`/`profitPercentOverride` are the
 * owner-approved manual-override fields (2026-08-10) — threaded straight
 * through to the pure functions, which already know how to apply them.
 */
export function computeItemPricing(item: PricingLineItem, ctx: PricingContext): ItemPricingResult {
  const pricing = item.pricing;

  switch (pricing.kind) {
    case 'LOOSE_PAPER': {
      const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
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
        zincCostOverride: pricing.zincCostOverride,
        printCostOverride: pricing.printCostOverride,
        profitPercentOverride: pricing.profitPercentOverride,
        extraCosts: sumExtraCosts(pricing),
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
      const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
      if (sheetPrice === undefined) {
        throw new PricingInputError(`Inventory item "${pricing.inventoryItemId}" has no linked sheet price`);
      }
      const result = calculateNotebookCost({
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
        zincCostOverride: pricing.zincCostOverride,
        printCostOverride: pricing.printCostOverride,
        profitPercentOverride: pricing.profitPercentOverride,
        extraCosts: sumExtraCosts(pricing),
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
        } as unknown as Prisma.InputJsonValue,
        sheetsNeeded: result.sheetsNeeded,
        inventoryItemId: pricing.inventoryItemId,
        sizeFamilyKey: pricing.sizeFamilyKey,
        realSizeLabel: pricing.realSizeLabel,
      };
    }
    case 'ENVELOPE': {
      const result = calculateEnvelopeCost({
        quantity: pricing.quantity,
        colorCount: pricing.colorCount,
        isNewDesign: pricing.isNewDesign,
        readyEnvelopePricePerPiece: pricing.readyEnvelopePricePerPiece,
        settings: ctx.pricingConstants,
        zincCostOverride: pricing.zincCostOverride,
        printCostOverride: pricing.printCostOverride,
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
      const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
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
        zincCostOverride: pricing.zincCostOverride,
        printCostOverride: pricing.printCostOverride,
        profitPercentOverride: pricing.profitPercentOverride,
        extraCosts: sumExtraCosts(pricing),
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
      const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
      if (sheetPrice === undefined) {
        throw new PricingInputError(`Inventory item "${pricing.inventoryItemId}" has no linked sheet price`);
      }
      const result = calculateDigitalCost({
        pieceWidthCm: pricing.pieceWidthCm,
        pieceHeightCm: pricing.pieceHeightCm,
        quantity: pricing.quantity,
        yieldPerQuarter: pricing.yieldPerQuarter,
        sheetPrice,
        sellophaneEnabled: pricing.sellophaneEnabled,
        boshrPricePerPiece: pricing.boshrPricePerPiece,
        settings: ctx.digitalConstants,
        profitPercentOverride: pricing.profitPercentOverride,
        extraCosts: sumExtraCosts(pricing),
      });
      return {
        total: result.total,
        breakdown: {
          ...result,
          pieceWidthCm: pricing.pieceWidthCm,
          pieceHeightCm: pricing.pieceHeightCm,
          yieldPerQuarter: pricing.yieldPerQuarter,
          sellophaneEnabled: pricing.sellophaneEnabled ?? null,
          paperName: ctx.paperNameByInventoryItemId.get(pricing.inventoryItemId) ?? null,
        } as unknown as Prisma.InputJsonValue,
        sheetsNeeded: null,
        inventoryItemId: pricing.inventoryItemId,
        sizeFamilyKey: null,
        realSizeLabel: null,
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
        extraCosts: sumExtraCosts(pricing),
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
    case 'PRODUCT':
    case 'SERVICE': {
      const catalogId = item.readyProductId ?? item.serviceId;
      if (!catalogId) {
        throw new PricingInputError(`A ${pricing.kind} item requires readyProductId or serviceId`);
      }
      const unitPrice = ctx.catalogPriceById.get(catalogId);
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
  }
}
