import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  Attachment,
  BoardMaterial,
  BranchSummary,
  BusinessPartner,
  CreateOrderInput,
  CreatePaymentInput,
  CreateQuotationInput,
  Gender,
  InventoryItem,
  Order,
  OrderItemPricingInput,
  PaymentMethod,
  PricingReference,
  ProductionTrack,
  Quotation,
  ReadyProduct,
  Service,
  SizeFamily,
  UpdateOrderInput,
  UpdateQuotationInput,
  WorkflowTemplate,
  WorkOrder,
} from '@cleopatra/shared';
import {
  calculateBoardsCost,
  calculateDigitalCost,
  calculateEnvelopeCost,
  calculateFolderCost,
  calculateLoosePaperCost,
  calculateNotebookCost,
  calculateProductOrServiceCost,
  suggestYield,
} from '@cleopatra/shared';
import { apiGet, apiPost, apiPostFormData, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PartnerCombobox } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';
import { ORDER_ITEM_CATEGORIES } from '@/lib/orders/itemCategories';

type PricingKind = OrderItemPricingInput['kind'];
/** Which document the unified الطلبات والمستندات screen saves the same item set as (owner, 2026-08-10 — one creation flow, two destinations). Work Order generation is a follow-on action on an already-created Invoice, not a third save target — a WorkOrder always wraps an existing Order (see `createWorkOrder`'s own doc comment). */
type DocumentType = 'INVOICE' | 'QUOTATION';

const PRODUCT_SOURCE_TYPE_LABELS: Record<NonNullable<ReadyProduct['sourceType']>, string> = {
  INTERNAL_PRODUCTION: 'تصنيع داخلي',
  EXTERNAL_SUPPLIER: 'مورّد خارجي',
};

const KIND_LABELS: Record<PricingKind, string> = {
  LOOSE_PAPER: 'ورق سايب',
  NOTEBOOK: 'دفاتر',
  ENVELOPE: 'أظرف',
  FOLDER: 'فولدرات',
  BOARDS: 'لوحات وإعلانات',
  DIGITAL: 'ديجيتال',
  PRODUCT: 'منتج جاهز',
  SERVICE: 'خدمة',
};

/** FEATURE-007 WF-B — matches `WorkflowTemplate.code` for the 4 tracks seeded by WF-A; the customer's chosen track routes the eventual Work Order, never inferred from item kind (owner, 2026-08-12). */
const PRODUCTION_TRACK_LABELS: Record<ProductionTrack, string> = {
  OFFSET: 'أوفست',
  DIGITAL: 'ديجيتال',
  BOARDS_SIGNAGE: 'لوحات وإعلانات',
  OTHER_PRODUCTS: 'منتجات أخرى',
  // FEATURE-009 (2026-08-13) — reserved tracks, no WorkflowTemplate exists
  // for either yet; createWorkOrder already handles that gracefully
  // (400 NO_PUBLISHED_TEMPLATE) if picked before one is defined.
  SERVICES: 'خدمات',
  READY_PRODUCTS: 'منتجات جاهزة',
};
const PRODUCTION_TRACK_OPTIONS = Object.keys(PRODUCTION_TRACK_LABELS) as ProductionTrack[];

const BOARD_MATERIAL_LABELS: Record<BoardMaterial, string> = {
  BANNER: 'بنر',
  VINYL_NORMAL: 'فنيل عادي',
  VINYL_PRINT_CUT: 'فنيل برنت اند كت',
  FLEX: 'فلكس',
  SEASRO: 'سيسرو',
};
const BOARD_MATERIAL_OPTIONS = Object.keys(BOARD_MATERIAL_LABELS) as BoardMaterial[];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'كاش',
  BANK_ACCOUNT: 'حساب بنكي',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'انستاباي',
};
const PAYMENT_METHOD_OPTIONS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

/**
 * The video's "الخدمات الإضافية" checkbox grid — maps 1:1 onto the four
 * manual amount fields every pricing kind's schema already accepts
 * (`extraServiceFields` in orderItemPricing.ts) and every `calculate*Cost`
 * function already sums into `extraCosts` (pricingEngineService.ts's
 * `sumExtraCosts`, mirrored client-side below). No fixed catalog price
 * exists for any of these — a checkbox just reveals the amount field
 * instead of it always being visible, closer to the video's look than a
 * bare number input always on screen.
 */
const EXTRA_SERVICE_DEFS = [
  { enabledKey: 'baggingEnabled', amountKey: 'baggingAmount', label: 'تغليف / تكييس' },
  { enabledKey: 'singleAdhesiveEnabled', amountKey: 'singleAdhesiveAmount', label: 'لصق بنطة واحدة' },
  { enabledKey: 'doubleAdhesiveEnabled', amountKey: 'doubleAdhesiveAmount', label: 'لصق بنطتين' },
  { enabledKey: 'sampleEnabled', amountKey: 'sampleAmount', label: 'عينة / نموذج' },
] as const;

/**
 * One flat draft shape covering every pricing kind's fields — simpler to
 * bind form inputs against than a discriminated union while the user is
 * mid-edit (a field can be blank/invalid before the item is priceable).
 * `buildPricingInput` below is the only place this gets narrowed into a
 * real `OrderItemPricingInput`.
 */
interface DraftItem {
  key: string;
  kind: PricingKind;
  itemType: string;
  notes: string;
  // FEATURE-009 (2026-08-13) — printed on the Offset Work Order job-card
  // only, no pricing effect. Shown only for print-section kinds.
  inkColor: string;
  bindingType: string;
  sellophaneType: string;
  description: string;
  readyProductId: string;
  serviceId: string;
  // LOOSE_PAPER / NOTEBOOK / FOLDER
  sizeFamilyKey: string;
  realSizeLabel: string;
  inventoryItemId: string;
  colorCount: string;
  isNewDesign: boolean;
  numberingStartNumber: string;
  sides: '1' | '2';
  quantity: string;
  // NOTEBOOK
  notebookQuantity: string;
  contentType: 'ORIGINAL_ONLY' | 'ORIGINAL_PLUS_COPIES';
  copies: string;
  bindingPricePerNotebook: string;
  // ENVELOPE
  readyEnvelopePricePerPiece: string;
  // FOLDER
  sellophaneEnabled: boolean;
  riza: string;
  jarab: string;
  forma: string;
  taksir: string;
  // BOARDS
  material: BoardMaterial;
  widthCm: string;
  heightCm: string;
  hasDesign: boolean;
  hasSellophane: boolean;
  // DIGITAL — reuses inventoryItemId (paper)/widthCm+heightCm (piece size)/sellophaneEnabled above.
  yieldPerQuarter: string;
  boshrPricePerPiece: string;
  // نسبة الربح — تعديل يدوي اختياري بدل النسبة الافتراضية من الإعدادات (LOOSE_PAPER/NOTEBOOK/ENVELOPE/FOLDER فقط — BOARDS/PRODUCT/SERVICE لا هامش ربح فيهم أصلًا).
  profitPercentEnabled: boolean;
  profitPercentOverride: string;
  // الخدمات الإضافية — every kind
  baggingEnabled: boolean;
  baggingAmount: string;
  singleAdhesiveEnabled: boolean;
  singleAdhesiveAmount: string;
  doubleAdhesiveEnabled: boolean;
  doubleAdhesiveAmount: string;
  sampleEnabled: boolean;
  sampleAmount: string;
  // صورة المنتج (اختياري)
  attachmentId: string;
  attachmentUrl: string;
  attachmentFileName: string;
  attachmentUploading: boolean;
  attachmentError: string | null;
}

let draftKeySeq = 0;
function emptyDraftItem(kind: PricingKind = 'LOOSE_PAPER'): DraftItem {
  draftKeySeq += 1;
  return {
    key: `item-${draftKeySeq}`,
    kind,
    itemType: '',
    notes: '',
    inkColor: '',
    bindingType: '',
    sellophaneType: '',
    description: '',
    readyProductId: '',
    serviceId: '',
    sizeFamilyKey: '',
    realSizeLabel: '',
    inventoryItemId: '',
    colorCount: '1',
    isNewDesign: false,
    numberingStartNumber: '',
    sides: '1',
    quantity: '1',
    notebookQuantity: '1',
    contentType: 'ORIGINAL_ONLY',
    copies: '0',
    bindingPricePerNotebook: '0',
    readyEnvelopePricePerPiece: '0',
    sellophaneEnabled: false,
    riza: '',
    jarab: '',
    forma: '',
    taksir: '',
    material: 'BANNER',
    widthCm: '',
    heightCm: '',
    hasDesign: false,
    hasSellophane: false,
    yieldPerQuarter: '',
    boshrPricePerPiece: '0',
    profitPercentEnabled: false,
    profitPercentOverride: '0',
    baggingEnabled: false,
    baggingAmount: '0',
    singleAdhesiveEnabled: false,
    singleAdhesiveAmount: '0',
    doubleAdhesiveEnabled: false,
    doubleAdhesiveAmount: '0',
    sampleEnabled: false,
    sampleAmount: '0',
    attachmentId: '',
    attachmentUrl: '',
    attachmentFileName: '',
    attachmentUploading: false,
    attachmentError: null,
  };
}

const toNum = (v: string): number => (v.trim() === '' ? 0 : Number(v));
const toOptionalNum = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));

function extraServiceFieldsOf(d: DraftItem) {
  return {
    baggingAmount: d.baggingEnabled ? toNum(d.baggingAmount) : undefined,
    singleAdhesiveAmount: d.singleAdhesiveEnabled ? toNum(d.singleAdhesiveAmount) : undefined,
    doubleAdhesiveAmount: d.doubleAdhesiveEnabled ? toNum(d.doubleAdhesiveAmount) : undefined,
    sampleAmount: d.sampleEnabled ? toNum(d.sampleAmount) : undefined,
  };
}

/** Client mirror of `pricingEngineService.ts`'s `sumExtraCosts` — same four fields, same summing, used only for the live preview. */
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

/** Narrows a `DraftItem` into a real `OrderItemPricingInput` — returns null while required fields for that kind aren't filled in yet (not an error, just "not priceable yet"). */
function buildPricingInput(d: DraftItem): OrderItemPricingInput | null {
  const extra = extraServiceFieldsOf(d);
  const margin = d.profitPercentEnabled ? { profitPercentOverride: toNum(d.profitPercentOverride) } : {};
  switch (d.kind) {
    case 'LOOSE_PAPER':
      if (!d.sizeFamilyKey || !d.realSizeLabel || !d.inventoryItemId || !d.quantity || !d.colorCount) return null;
      return {
        kind: 'LOOSE_PAPER',
        sizeFamilyKey: d.sizeFamilyKey,
        realSizeLabel: d.realSizeLabel,
        inventoryItemId: d.inventoryItemId,
        colorCount: toNum(d.colorCount),
        isNewDesign: d.isNewDesign,
        numberingStartNumber: toOptionalNum(d.numberingStartNumber),
        quantity: toNum(d.quantity),
        sides: d.sides === '2' ? 2 : 1,
        ...extra,
        ...margin,
      };
    case 'NOTEBOOK':
      if (!d.sizeFamilyKey || !d.realSizeLabel || !d.inventoryItemId || !d.notebookQuantity || !d.colorCount) return null;
      return {
        kind: 'NOTEBOOK',
        sizeFamilyKey: d.sizeFamilyKey,
        realSizeLabel: d.realSizeLabel,
        inventoryItemId: d.inventoryItemId,
        colorCount: toNum(d.colorCount),
        isNewDesign: d.isNewDesign,
        numberingStartNumber: toOptionalNum(d.numberingStartNumber),
        notebookQuantity: toNum(d.notebookQuantity),
        contentType: d.contentType,
        copies: d.contentType === 'ORIGINAL_PLUS_COPIES' ? toNum(d.copies) : undefined,
        bindingPricePerNotebook: toNum(d.bindingPricePerNotebook),
        ...extra,
        ...margin,
      };
    case 'ENVELOPE':
      if (!d.quantity || !d.colorCount) return null;
      return {
        kind: 'ENVELOPE',
        quantity: toNum(d.quantity),
        colorCount: toNum(d.colorCount),
        isNewDesign: d.isNewDesign,
        readyEnvelopePricePerPiece: toNum(d.readyEnvelopePricePerPiece),
        ...extra,
        ...margin,
      };
    case 'FOLDER':
      if (!d.sizeFamilyKey || !d.realSizeLabel || !d.inventoryItemId || !d.quantity || !d.colorCount) return null;
      return {
        kind: 'FOLDER',
        sizeFamilyKey: d.sizeFamilyKey,
        realSizeLabel: d.realSizeLabel,
        inventoryItemId: d.inventoryItemId,
        quantity: toNum(d.quantity),
        colorCount: toNum(d.colorCount),
        sides: d.sides === '2' ? 2 : 1,
        isNewDesign: d.isNewDesign,
        sellophaneEnabled: d.sellophaneEnabled,
        riza: toOptionalNum(d.riza),
        jarab: toOptionalNum(d.jarab),
        forma: toOptionalNum(d.forma),
        taksir: toOptionalNum(d.taksir),
        ...extra,
        ...margin,
      };
    case 'BOARDS':
      if (!d.widthCm || !d.heightCm || !d.quantity) return null;
      return {
        kind: 'BOARDS',
        material: d.material,
        widthCm: toNum(d.widthCm),
        heightCm: toNum(d.heightCm),
        quantity: toNum(d.quantity),
        hasDesign: d.material === 'BANNER' ? d.hasDesign : undefined,
        hasSellophane: d.material === 'VINYL_NORMAL' || d.material === 'VINYL_PRINT_CUT' ? d.hasSellophane : undefined,
        ...extra,
      };
    case 'DIGITAL':
      if (!d.inventoryItemId || !d.widthCm || !d.heightCm || !d.quantity || !d.yieldPerQuarter) return null;
      return {
        kind: 'DIGITAL',
        inventoryItemId: d.inventoryItemId,
        pieceWidthCm: toNum(d.widthCm),
        pieceHeightCm: toNum(d.heightCm),
        quantity: toNum(d.quantity),
        yieldPerQuarter: toNum(d.yieldPerQuarter),
        sellophaneEnabled: d.sellophaneEnabled,
        boshrPricePerPiece: toOptionalNum(d.boshrPricePerPiece),
        ...extra,
        ...margin,
      };
    case 'PRODUCT':
    case 'SERVICE':
      if (!d.quantity) return null;
      return { kind: d.kind, quantity: toNum(d.quantity), ...extra };
  }
}

interface PricingCtx {
  families: PricingReference['sizeFamilies'];
  pricingConstants: PricingReference['pricingConstants'];
  boardsConstants: PricingReference['boardsConstants'];
  digitalConstants: PricingReference['digitalConstants'];
  sheetPriceByInventoryItemId: Map<string, number>;
  catalogPriceById: Map<string, number>;
}

/** Every field any `calculate*Cost` result might carry — display-only (formula strings), never used to compute an actual total. */
interface PricingPreviewResult {
  sheetsNeeded?: number;
  paperCost?: number;
  zincCost?: number;
  printRuns?: number;
  printCost?: number;
  numberingRuns?: number;
  numberingCost?: number;
  designCost?: number;
  selloCost?: number;
  extraCosts?: number;
  subtotal?: number;
  total?: number;
  unitPrice?: number;
  // DIGITAL (§13.3)
  fitsInQuarter?: boolean;
  unitsNeeded?: number | null;
  costPerPiece?: number;
}

/** Client-side mirror of `orderService.ts`'s `computeItemPricing` dispatch — same pure functions, used only for the live preview; the server always recomputes authoritatively on submit. */
function previewItemTotal(
  d: DraftItem,
  ctx: PricingCtx,
): { total: number; error: string | null; result: PricingPreviewResult | null } {
  const pricing = buildPricingInput(d);
  if (!pricing) return { total: 0, error: null, result: null };
  const extraCosts = sumExtraCosts(pricing);

  const families = ctx.families.map((f) => ({
    key: f.key,
    base: f.base,
    entries: f.entries.map((e) => ({ label: e.label, piecesPerSheet: e.piecesPerSheet })),
  }));

  try {
    switch (pricing.kind) {
      case 'LOOSE_PAPER': {
        const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
        if (sheetPrice === undefined) return { total: 0, error: 'الصنف المختار غير مرتبط بسعر ورق', result: null };
        const r = calculateLoosePaperCost({
          familyKey: pricing.sizeFamilyKey,
          realLabel: pricing.realSizeLabel,
          quantity: pricing.quantity,
          colorCount: pricing.colorCount,
          sides: pricing.sides,
          isNewDesign: pricing.isNewDesign,
          numbering: pricing.numberingStartNumber ? { startNumber: pricing.numberingStartNumber } : undefined,
          sheetPrice,
          families,
          settings: ctx.pricingConstants,
          extraCosts,
          profitPercentOverride: pricing.profitPercentOverride,
        });
        return { total: r.total, error: null, result: r };
      }
      case 'NOTEBOOK': {
        const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
        if (sheetPrice === undefined) return { total: 0, error: 'الصنف المختار غير مرتبط بسعر ورق', result: null };
        const r = calculateNotebookCost({
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
          families,
          settings: ctx.pricingConstants,
          extraCosts,
          profitPercentOverride: pricing.profitPercentOverride,
        });
        return { total: r.total, error: null, result: r };
      }
      case 'ENVELOPE': {
        const r = calculateEnvelopeCost({
          quantity: pricing.quantity,
          colorCount: pricing.colorCount,
          isNewDesign: pricing.isNewDesign,
          readyEnvelopePricePerPiece: pricing.readyEnvelopePricePerPiece,
          settings: ctx.pricingConstants,
          extraCosts,
          profitPercentOverride: pricing.profitPercentOverride,
        });
        return { total: r.total, error: null, result: r };
      }
      case 'FOLDER': {
        const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
        if (sheetPrice === undefined) return { total: 0, error: 'الصنف المختار غير مرتبط بسعر ورق', result: null };
        const r = calculateFolderCost({
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
          families,
          settings: ctx.pricingConstants,
          extraCosts,
          profitPercentOverride: pricing.profitPercentOverride,
        });
        return { total: r.total, error: null, result: r };
      }
      case 'BOARDS': {
        const r = calculateBoardsCost({
          material: pricing.material,
          widthCm: pricing.widthCm,
          heightCm: pricing.heightCm,
          quantity: pricing.quantity,
          hasDesign: pricing.hasDesign,
          hasSellophane: pricing.hasSellophane,
          settings: ctx.boardsConstants,
          extraCosts,
        });
        return { total: r.total, error: null, result: r };
      }
      case 'DIGITAL': {
        const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
        if (sheetPrice === undefined) return { total: 0, error: 'الصنف المختار غير مرتبط بسعر ورق', result: null };
        const r = calculateDigitalCost({
          pieceWidthCm: pricing.pieceWidthCm,
          pieceHeightCm: pricing.pieceHeightCm,
          quantity: pricing.quantity,
          yieldPerQuarter: pricing.yieldPerQuarter,
          sheetPrice,
          sellophaneEnabled: pricing.sellophaneEnabled,
          boshrPricePerPiece: pricing.boshrPricePerPiece,
          settings: ctx.digitalConstants,
          extraCosts,
          profitPercentOverride: pricing.profitPercentOverride,
        });
        return { total: r.total, error: null, result: r };
      }
      case 'PRODUCT':
      case 'SERVICE': {
        const catalogId = d.readyProductId || d.serviceId;
        if (!catalogId) return { total: 0, error: null, result: null };
        const unitPrice = ctx.catalogPriceById.get(catalogId);
        if (unitPrice === undefined) return { total: 0, error: 'لا يوجد سعر لهذا الصنف', result: null };
        const total = calculateProductOrServiceCost(unitPrice, pricing.quantity, extraCosts);
        return { total, error: null, result: { unitPrice, extraCosts, total } };
      }
    }
  } catch (err) {
    return { total: 0, error: err instanceof Error ? err.message : 'تعذر حساب السعر', result: null };
  }
}

/** Short human line shown on the cart row — not the frozen breakdown, just enough for the staff member to recognize which item is which. */
function describeDraft(d: DraftItem, readyProducts: ReadyProduct[], services: Service[]): string {
  switch (d.kind) {
    case 'LOOSE_PAPER':
      return `${d.itemType || KIND_LABELS.LOOSE_PAPER} — ${d.realSizeLabel} — الكمية ${d.quantity} — ${d.colorCount} لون`;
    case 'NOTEBOOK':
      return `${d.itemType || KIND_LABELS.NOTEBOOK} — ${d.realSizeLabel} — ${d.notebookQuantity} دفتر`;
    case 'ENVELOPE':
      return `${d.itemType || KIND_LABELS.ENVELOPE} — ${d.quantity} قطعة`;
    case 'FOLDER':
      return `${d.itemType || KIND_LABELS.FOLDER} — ${d.realSizeLabel} — ${d.quantity} قطعة`;
    case 'BOARDS':
      return `${d.itemType || BOARD_MATERIAL_LABELS[d.material]} — ${d.widthCm}×${d.heightCm} سم — ${d.quantity} قطعة`;
    case 'DIGITAL':
      return `${d.itemType || KIND_LABELS.DIGITAL} — ${d.widthCm}×${d.heightCm} سم — ${d.quantity} قطعة`;
    case 'PRODUCT':
      return `${readyProducts.find((p) => p.id === d.readyProductId)?.name ?? d.itemType} × ${d.quantity}`;
    case 'SERVICE':
      return `${services.find((s) => s.id === d.serviceId)?.name ?? d.itemType} × ${d.quantity}`;
  }
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

/** Loosely-typed shape of everything `computeItemPricing` might have merged into a frozen `breakdown` — used only when reconstructing an existing item for editing (see `reconstructPricingInput` below). */
interface StoredBreakdown {
  kind?: 'PRODUCT' | 'SERVICE';
  quantity?: number;
  colorCount?: number;
  sides?: 1 | 2;
  isNewDesign?: boolean;
  numberingStartNumber?: number | null;
  contentType?: 'ORIGINAL_ONLY' | 'ORIGINAL_PLUS_COPIES';
  copies?: number | null;
  bindingCost?: number;
  sellophaneEnabled?: boolean;
  material?: BoardMaterial;
  widthCm?: number;
  heightCm?: number;
  hasDesign?: boolean | null;
  hasSellophane?: boolean | null;
  readyEnvelopePricePerPiece?: number;
  // DIGITAL (§13.3) — `fitsInQuarter` is the distinguishing marker checked
  // in `inferStoredKind` (FOLDER also freezes `sellophaneEnabled`, so that
  // field alone can't tell the two apart).
  fitsInQuarter?: boolean;
  unitsNeeded?: number | null;
  pieceWidthCm?: number;
  pieceHeightCm?: number;
  yieldPerQuarter?: number;
  costPerPiece?: number;
  boshrCostPerPiece?: number;
  extraCosts?: number;
  notes?: string | null;
  referenceImageUrl?: string | null;
  // FEATURE-009 (2026-08-13) — see createOrderItemSchema's own doc comment.
  inkColor?: string | null;
  bindingType?: string | null;
  sellophaneType?: string | null;
  /** FEATURE-007 (2026-08-12, owner: "المفروض أقدر أعدل في عرض السعر إني أضيف مثلا بند") — `QuotationItem` has no top-level `inventoryItemId` column (a Quotation never draws down stock) and the pricing engine never freezes the raw id into `breakdown` either (only `orderService`'s own `OrderItem.inventoryItemId` column gets it, from the pricing result's sibling field, not from `breakdown` itself). `paperName`, however, IS frozen into `breakdown` for LOOSE_PAPER/NOTEBOOK/FOLDER (see `pricingEngineService.ts`'s per-kind breakdown merge) — matched back to a live `InventoryItem` by name below, the same "match by name" fallback `matchCatalogIdByName` already uses for PRODUCT/SERVICE catalog references. */
  paperName?: string | null;
}

/**
 * FEATURE-007 — editing (owner, 2026-08-12: "استبدال كامل للأصناف").
 * Neither `OrderItem` nor `QuotationItem` stores the original
 * `OrderItemPricingInput` — only its frozen `breakdown` result — and for
 * LOOSE_PAPER/NOTEBOOK/ENVELOPE/FOLDER/BOARDS that frozen result doesn't
 * even carry the pricing `kind` literal itself (only PRODUCT/SERVICE's
 * breakdown does). Both are inferred here from which fields are actually
 * present — each kind's breakdown shape is mutually exclusive by
 * construction (`pricingEngineService.ts`'s per-kind merge), so this is
 * reliable, not a guess. A few edge-case fields were never frozen at all
 * (manual `*Override`s, FOLDER's riza/jarab/forma/taksir, NOTEBOOK's exact
 * `bindingPricePerNotebook` rate — approximated from `bindingCost`) and
 * are lost on edit; acceptable given the chosen semantics recompute
 * against current settings anyway, not preserve a frozen calculation
 * verbatim. The four extra-service amounts collapse into one
 * `sampleAmount` bucket — their sum survives, which original checkbox
 * they were under doesn't.
 */
function inferStoredKind(sizeFamilyKey: string | null, breakdown: StoredBreakdown): PricingKind | null {
  if (breakdown.kind === 'PRODUCT' || breakdown.kind === 'SERVICE') return breakdown.kind;
  if ('material' in breakdown) return 'BOARDS';
  // Checked before FOLDER — both freeze `sellophaneEnabled`, but only DIGITAL freezes `fitsInQuarter`.
  if ('fitsInQuarter' in breakdown) return 'DIGITAL';
  if ('readyEnvelopePricePerPiece' in breakdown) return 'ENVELOPE';
  if ('contentType' in breakdown) return 'NOTEBOOK';
  if ('sellophaneEnabled' in breakdown) return 'FOLDER';
  if (sizeFamilyKey) return 'LOOSE_PAPER';
  return null;
}

function reconstructPricingInput(
  kind: PricingKind,
  b: StoredBreakdown,
  sizeFamilyKey: string | null,
  realSizeLabel: string | null,
  inventoryItemId: string | null,
): OrderItemPricingInput | null {
  const extra = b.extraCosts ? { sampleAmount: b.extraCosts } : {};
  switch (kind) {
    case 'LOOSE_PAPER':
      if (!sizeFamilyKey || !realSizeLabel || !inventoryItemId) return null;
      return {
        kind: 'LOOSE_PAPER',
        sizeFamilyKey,
        realSizeLabel,
        inventoryItemId,
        colorCount: b.colorCount ?? 1,
        isNewDesign: b.isNewDesign ?? false,
        numberingStartNumber: b.numberingStartNumber ?? undefined,
        quantity: b.quantity ?? 1,
        sides: b.sides === 2 ? 2 : 1,
        ...extra,
      };
    case 'NOTEBOOK':
      if (!sizeFamilyKey || !realSizeLabel || !inventoryItemId) return null;
      return {
        kind: 'NOTEBOOK',
        sizeFamilyKey,
        realSizeLabel,
        inventoryItemId,
        colorCount: b.colorCount ?? 1,
        isNewDesign: b.isNewDesign ?? false,
        numberingStartNumber: b.numberingStartNumber ?? undefined,
        notebookQuantity: b.quantity ?? 1,
        contentType: b.contentType ?? 'ORIGINAL_ONLY',
        copies: b.copies ?? undefined,
        bindingPricePerNotebook: b.quantity ? (b.bindingCost ?? 0) / b.quantity : 0,
        ...extra,
      };
    case 'ENVELOPE':
      return {
        kind: 'ENVELOPE',
        quantity: b.quantity ?? 1,
        colorCount: b.colorCount ?? 1,
        isNewDesign: b.isNewDesign ?? false,
        readyEnvelopePricePerPiece: b.readyEnvelopePricePerPiece ?? 0,
        ...extra,
      };
    case 'FOLDER':
      if (!sizeFamilyKey || !realSizeLabel || !inventoryItemId) return null;
      return {
        kind: 'FOLDER',
        sizeFamilyKey,
        realSizeLabel,
        inventoryItemId,
        quantity: b.quantity ?? 1,
        colorCount: b.colorCount ?? 1,
        sides: b.sides === 2 ? 2 : 1,
        isNewDesign: b.isNewDesign ?? false,
        sellophaneEnabled: b.sellophaneEnabled ?? false,
        ...extra,
      };
    case 'BOARDS':
      return {
        kind: 'BOARDS',
        material: b.material ?? 'BANNER',
        widthCm: b.widthCm ?? 1,
        heightCm: b.heightCm ?? 1,
        quantity: b.quantity ?? 1,
        hasDesign: b.hasDesign ?? undefined,
        hasSellophane: b.hasSellophane ?? undefined,
        ...extra,
      };
    case 'DIGITAL':
      if (!inventoryItemId) return null;
      return {
        kind: 'DIGITAL',
        inventoryItemId,
        pieceWidthCm: b.pieceWidthCm ?? 1,
        pieceHeightCm: b.pieceHeightCm ?? 1,
        quantity: b.quantity ?? 1,
        yieldPerQuarter: b.yieldPerQuarter ?? 1,
        sellophaneEnabled: b.sellophaneEnabled ?? false,
        boshrPricePerPiece: b.boshrCostPerPiece ?? undefined,
        ...extra,
      };
    case 'PRODUCT':
    case 'SERVICE':
      return { kind, quantity: b.quantity ?? 1, ...extra };
  }
}

/** Order items have no `readyProductId`/`serviceId` column at all (only Quotation items do) — a PRODUCT/SERVICE item's catalog reference is matched back by its frozen `modelName` (the catalog name at freeze time). Returns `undefined` if no live catalog row has that exact name any more (renamed/deleted since) — the caller then flags that item instead of silently mispricing it. */
function matchCatalogIdByName(
  kind: 'PRODUCT' | 'SERVICE',
  modelName: string | null,
  readyProducts: ReadyProduct[],
  services: Service[],
): string | undefined {
  if (!modelName) return undefined;
  return kind === 'PRODUCT' ? readyProducts.find((p) => p.name === modelName)?.id : services.find((s) => s.name === modelName)?.id;
}

/** Same "match by name" fallback as `matchCatalogIdByName`, for the paper an existing LOOSE_PAPER/NOTEBOOK/FOLDER item used — see `StoredBreakdown.paperName`'s own doc comment for why this is needed at all. */
function matchInventoryItemIdByName(paperName: string | null | undefined, inventoryItems: InventoryItem[]): string | null {
  if (!paperName) return null;
  return inventoryItems.find((i) => i.name === paperName)?.id ?? null;
}

interface ReconstructedLine {
  line: CartLine | null;
  /** Set when a PRODUCT/SERVICE item's catalog reference couldn't be matched by name any more — the item was dropped and the caller should tell the user why. */
  warning: string | null;
}

/** Shared by both edit-Order and edit-Quotation modes — the two item shapes carry the same fields relevant here. */
function reconstructCartLine(
  item: { id: string; kind: string | null; modelName: string | null; breakdown?: unknown; itemTotal: number | null; sizeFamilyKey: string | null; realSizeLabel: string | null; inventoryItemId?: string | null; readyProductId?: string | null; serviceId?: string | null },
  readyProducts: ReadyProduct[],
  services: Service[],
  inventoryItems: InventoryItem[],
): ReconstructedLine {
  const b = (item.breakdown as StoredBreakdown | null) ?? {};
  const inventoryItemId = item.inventoryItemId ?? matchInventoryItemIdByName(b.paperName, inventoryItems);
  const kind = inferStoredKind(item.sizeFamilyKey, b);
  if (!kind) {
    return { line: null, warning: `تعذر التعرف على نوع البند "${item.modelName ?? item.kind ?? ''}" — احذفه وأضفه من جديد` };
  }

  let readyProductId = item.readyProductId ?? undefined;
  let serviceId = item.serviceId ?? undefined;
  if (kind === 'PRODUCT' && !readyProductId) readyProductId = matchCatalogIdByName('PRODUCT', item.modelName, readyProducts, services);
  if (kind === 'SERVICE' && !serviceId) serviceId = matchCatalogIdByName('SERVICE', item.modelName, readyProducts, services);
  if ((kind === 'PRODUCT' && !readyProductId) || (kind === 'SERVICE' && !serviceId)) {
    return {
      line: null,
      warning: `الصنف "${item.modelName ?? ''}" لم يعد موجودًا في الكتالوج — احذف البند وأضف بديلاً له`,
    };
  }

  const pricing = reconstructPricingInput(kind, b, item.sizeFamilyKey, item.realSizeLabel, inventoryItemId);
  if (!pricing) {
    return { line: null, warning: `تعذر إعادة بناء بيانات البند "${item.modelName ?? ''}" — احذفه وأضفه من جديد` };
  }

  return {
    line: {
      key: item.id,
      itemType: item.modelName || item.kind || KIND_LABELS[kind],
      summary: `${item.modelName || KIND_LABELS[kind]} — الكمية ${b.quantity ?? '—'}`,
      notes: b.notes ?? undefined,
      inkColor: b.inkColor ?? undefined,
      bindingType: b.bindingType ?? undefined,
      sellophaneType: b.sellophaneType ?? undefined,
      readyProductId,
      serviceId,
      attachmentUrl: b.referenceImageUrl ?? undefined,
      pricing,
      total: item.itemTotal ?? 0,
    },
    warning: null,
  };
}

/**
 * FEATURE-006 M2 / FEATURE-007 PE-E — Direct Order/Invoice creation, wired
 * to the real pricing engine. Each item is priced client-side for an
 * instant preview (PRICING_ENGINE_SPEC.md §5 — "كل الحسابات المالية تُحسب
 * لحظيًا في الواجهة") using the exact same pure functions
 * (`packages/shared/src/pricing/*`) the server runs authoritatively on
 * submit — never a client-computed total sent as-is (see
 * `orderItemPricing.ts`'s own doc comment).
 *
 * FEATURE-007 (2026-08-12) — the screen's layout/flow now matches the
 * owner's reference video frame-for-frame (cart of added items on the
 * side, one-item-at-a-time composer, live formula strings, "الخدمات
 * الإضافية" checkboxes, a "التحصيل" payment section, reference-image
 * upload, and the video's exact save/print button set) while keeping every
 * one of Cleopatra's 7 real pricing kinds intact — see 02_PLAN.md's
 * "مطابقة شاشة الطلبات والمستندات" section for the full design decision.
 */
type CreatedResult = { type: 'INVOICE'; order: Order } | { type: 'QUOTATION'; quotation: Quotation };

export function NewOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editOrderId = searchParams.get('editOrder');
  const editQuotationId = searchParams.get('editQuotation');
  // FEATURE-016 (2026-08-16) — the Documents page's per-customer "+ إضافة"
  // link lands here with the customer pre-selected, same query-param
  // pattern as editOrder/editQuotation above.
  const presetPartnerId = searchParams.get('partnerId') ?? undefined;
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [readyProducts, setReadyProducts] = useState<ReadyProduct[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [pricingReference, setPricingReference] = useState<PricingReference | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editQuotation, setEditQuotation] = useState<Quotation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState<CreatedResult | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<BusinessPartner[]>('/api/partners'),
      apiGet<BranchSummary[]>('/api/branches'),
      apiGet<ReadyProduct[]>('/api/ready-products').catch(() => []),
      apiGet<Service[]>('/api/services').catch(() => []),
      apiGet<InventoryItem[]>('/api/inventory-items').catch(() => []),
      apiGet<PricingReference>('/api/pricing-reference'),
      editOrderId ? apiGet<Order>(`/api/orders/${editOrderId}`) : Promise.resolve(null),
      editQuotationId ? apiGet<Quotation>(`/api/quotations/${editQuotationId}`) : Promise.resolve(null),
    ])
      .then(([p, b, rp, s, inv, pricing, order, quotation]) => {
        setPartners(p);
        setBranches(b);
        setReadyProducts(rp);
        setServices(s);
        setInventoryItems(inv);
        setPricingReference(pricing);
        setEditOrder(order);
        setEditQuotation(quotation);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'تعذر تحميل البيانات'))
      .finally(() => setLoading(false));
  }, [editOrderId, editQuotationId]);

  if (loadError) return <div className="text-destructive text-sm">{loadError}</div>;
  if (loading || !pricingReference) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;
  if (editOrderId && !editOrder) return <div className="text-destructive text-sm">الفاتورة غير موجودة.</div>;
  if (editQuotationId && !editQuotation) return <div className="text-destructive text-sm">عرض السعر غير موجود.</div>;

  if (created?.type === 'INVOICE') {
    const { order } = created;
    return (
      <div className="border-border bg-card mx-auto max-w-lg space-y-3 rounded-2xl border p-6 text-center">
        <p className="text-success text-lg font-bold">تم إنشاء الفاتورة بنجاح</p>
        <p className="text-2xl font-bold">{order.invoiceNumber}</p>
        <p className="text-muted-foreground text-sm">الإجمالي: {money(order.finalTotal)} ج.م</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/quotations')}>
            العودة إلى المستندات
          </Button>
          <Button type="button" onClick={() => navigate(`/orders/${order.id}`)}>
            طباعة الفاتورة
          </Button>
          <Button type="button" variant="secondary" onClick={() => setCreated(null)}>
            مستند جديد آخر
          </Button>
        </div>
        {/* FEATURE-016 (2026-08-16) — an invoice with a published-template
            production track now enters production automatically (see
            orderService.createOrder), so `order.workOrderId` is usually
            already set here; only fall back to the manual panel when it
            isn't (no track, or no published template yet for it). */}
        {order.workOrderId ? (
          <Button type="button" variant="secondary" onClick={() => navigate(`/work-orders/${order.workOrderId}`)}>
            طباعة أمر الشغل
          </Button>
        ) : (
          <GenerateWorkOrderPanel orderId={order.id} productionTrack={order.productionTrack} />
        )}
      </div>
    );
  }

  if (created?.type === 'QUOTATION') {
    const { quotation } = created;
    return (
      <div className="border-border bg-card mx-auto max-w-lg space-y-3 rounded-2xl border p-6 text-center">
        <p className="text-success text-lg font-bold">تم إنشاء عرض السعر بنجاح</p>
        <p className="text-2xl font-bold">{quotation.quotationNumber}</p>
        <p className="text-muted-foreground text-sm">الإجمالي: {money(quotation.finalTotal)} ج.م</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/quotations')}>
            العودة إلى المستندات
          </Button>
          <Button type="button" onClick={() => navigate(`/quotations/${quotation.id}`)}>
            عرض التفاصيل
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(`/quotations/${quotation.id}/print`)}>
            طباعة عرض السعر
          </Button>
          <Button type="button" variant="secondary" onClick={() => setCreated(null)}>
            مستند جديد آخر
          </Button>
        </div>
      </div>
    );
  }

  return (
    <NewOrderForm
      partners={partners}
      branches={branches}
      readyProducts={readyProducts}
      services={services}
      inventoryItems={inventoryItems}
      pricingReference={pricingReference}
      onCreated={setCreated}
      editOrder={editOrder}
      editQuotation={editQuotation}
      presetPartnerId={presetPartnerId}
    />
  );
}

/**
 * A Work Order always wraps an already-created Order (`createWorkOrder`
 * requires `orderId` + a *published* `templateCode`) — it's never one of
 * the unified screen's save-as targets itself, just a follow-on action
 * once the Invoice exists, mirroring the existing "طباعة الفاتورة" button
 * right next to it. Requires at least one published WorkflowTemplate
 * (FEATURE-007 WF-A) — until one exists this honestly shows that instead
 * of pretending the action is available. Button styling matches the
 * reference video's "طباعة كل أوامر الشغل" footer button now that a
 * WorkflowTemplate always exists (WF-A shipped 2026-08-12).
 */
function GenerateWorkOrderPanel({
  orderId,
  productionTrack,
}: {
  orderId: string;
  productionTrack: ProductionTrack | null;
}) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [templateCode, setTemplateCode] = useState('');
  const [created, setCreated] = useState<WorkOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!can('work-orders.edit')) return;
    apiGet<WorkflowTemplate[]>('/api/workflow-templates')
      .then((all) => {
        // Latest *published* version per code — `createWorkOrder` resolves
        // `templateCode` to `getLatestPublishedTemplate`, so a draft-only
        // code (never published) or an older published version isn't a
        // valid choice here.
        const latestPublishedByCode = new Map<string, WorkflowTemplate>();
        for (const t of all) {
          if (!t.publishedAt) continue;
          const existing = latestPublishedByCode.get(t.code);
          if (!existing || t.version > existing.version) latestPublishedByCode.set(t.code, t);
        }
        const list = [...latestPublishedByCode.values()];
        setTemplates(list);
        // FEATURE-007 WF-B — pre-select the track chosen at order creation
        // (still overridable below) instead of just whichever came first.
        const preferred = productionTrack && latestPublishedByCode.has(productionTrack)
          ? productionTrack
          : (list[0]?.code ?? '');
        setTemplateCode(preferred);
      })
      .catch(() => setTemplates([]));
  }, [can, productionTrack]);

  if (!can('work-orders.edit')) return null;

  const generate = async () => {
    if (!templateCode || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const workOrder = await apiPost<WorkOrder>('/api/work-orders', { orderId, templateCode });
      setCreated(workOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء أمر الشغل');
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="border-border bg-muted/30 space-y-2 rounded-xl border p-3 text-sm">
        <p className="font-medium">تم إنشاء أمر الشغل</p>
        <p className="text-muted-foreground">{created.workOrderNumber}</p>
        <Button type="button" size="sm" onClick={() => navigate(`/work-orders/${created.id}`)}>
          طباعة كل أوامر الشغل 🖶
        </Button>
      </div>
    );
  }

  return (
    <div className="border-border space-y-2 rounded-xl border border-dashed p-3 text-start">
      <p className="text-sm font-medium">إنشاء أمر شغل</p>
      {templates === null ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : templates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          لا يوجد نموذج تدفق عمل منشور بعد — لازم يتم إعداد نماذج التدفق أولاً من إعدادات النظام.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={templateCode}
            onChange={(e) => setTemplateCode(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          >
            {templates.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" disabled={submitting} onClick={() => void generate()}>
            {submitting ? 'جارٍ الإنشاء…' : 'إنشاء أمر شغل'}
          </Button>
        </div>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

/** One already-added line in the "بنود الفاتورة" cart — frozen at add-time, same shape the server will re-price on submit. */
interface CartLine {
  key: string;
  itemType: string;
  summary: string;
  notes?: string;
  inkColor?: string;
  bindingType?: string;
  sellophaneType?: string;
  readyProductId?: string;
  serviceId?: string;
  attachmentId?: string;
  attachmentUrl?: string;
  pricing: OrderItemPricingInput;
  total: number;
}

interface PaymentRow {
  key: string;
  method: PaymentMethod;
  amount: string;
}

let paymentKeySeq = 0;
const emptyPaymentRow = (): PaymentRow => {
  paymentKeySeq += 1;
  return { key: `pay-${paymentKeySeq}`, method: 'CASH', amount: '' };
};

function NewOrderForm({
  partners,
  branches,
  readyProducts,
  services,
  inventoryItems,
  pricingReference,
  onCreated,
  editOrder,
  editQuotation,
  presetPartnerId,
}: {
  partners: BusinessPartner[];
  branches: BranchSummary[];
  readyProducts: ReadyProduct[];
  services: Service[];
  inventoryItems: InventoryItem[];
  pricingReference: PricingReference;
  onCreated: (result: CreatedResult) => void;
  /** FEATURE-007 — full item-replacement edit (owner, 2026-08-12: "استبدال كامل للأصناف"). Present only when reached via `/orders/new?editOrder=<id>`. */
  editOrder?: Order | null;
  /** FEATURE-007 (2026-08-12, owner: "المفروض أقدر أعدل في عرض السعر إني أضيف مثلا بند") — same full item-replacement edit, for a Quotation. Present only when reached via `/orders/new?editQuotation=<id>`. Mutually exclusive with `editOrder` — never both set. */
  editQuotation?: Quotation | null;
  /** FEATURE-016 — pre-selects the customer when reached from a Documents group's "+ إضافة" link (`/orders/new?partnerId=<id>`). Ignored once editOrder/editQuotation already fix the customer. */
  presetPartnerId?: string;
}) {
  const { can } = useAuth();
  const canInvoice = can('orders.create');
  const canQuotation = can('quotations.create');
  const isEditing = Boolean(editOrder) || Boolean(editQuotation);
  const [documentType, setDocumentType] = useState<DocumentType>(
    editOrder ? 'INVOICE' : editQuotation ? 'QUOTATION' : canInvoice ? 'INVOICE' : 'QUOTATION',
  );
  // نسخة محلية قابلة للتحديث — عشان لما تتضاف عميل جديد من نفس الشاشة يظهر فورًا بدون إعادة تحميل الصفحة.
  const [localPartners, setLocalPartners] = useState<BusinessPartner[]>(partners);
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [partnerId, setPartnerId] = useState(
    editOrder?.partnerId ?? editQuotation?.partnerId ?? presetPartnerId ?? partners[0]?.id ?? '',
  );
  const [branchId, setBranchId] = useState(editOrder?.branchId ?? editQuotation?.branchId ?? branches[0]?.id ?? '');
  const [productionTrack, setProductionTrack] = useState<ProductionTrack | ''>(editOrder?.productionTrack ?? '');
  // FEATURE-010 (2026-08-14, owner: "عند إنشاء الطلب يجب أن يكون واضحًا هل:
  // Requires Design = نعم / لا") — only meaningful for Offset/Digital today
  // (the only tracks with a published v2 template whose first stage is a
  // skippable design stage); defaults true (existing behavior: every order
  // goes through design unless told otherwise).
  const [requiresDesign, setRequiresDesign] = useState(editOrder?.requiresDesign ?? true);
  const [deliveryDate, setDeliveryDate] = useState(editOrder?.deliveryDate?.slice(0, 10) ?? '');
  const [validUntil, setValidUntil] = useState(() => {
    if (editQuotation) return editQuotation.validUntil?.slice(0, 10) ?? '';
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [discountPercent, setDiscountPercent] = useState(String(editOrder?.discountPercent ?? editQuotation?.discountPercent ?? 0));
  const [vatOn, setVatOn] = useState(editOrder?.vatOn ?? editQuotation?.vatOn ?? false);
  const [customerNotes, setCustomerNotes] = useState(editOrder?.customerNotes ?? editQuotation?.customerNotes ?? '');
  const [internalNotes, setInternalNotes] = useState(editOrder?.internalNotes ?? editQuotation?.internalNotes ?? '');

  // بنود الفاتورة/العرض — السلة الفعلية (بعد "إضافة للفاتورة" بس)، أو معاد بناؤها من مستند موجود عند التعديل.
  const editingItems = editOrder?.items ?? editQuotation?.items;
  const [cart, setCart] = useState<CartLine[]>(() => {
    if (!editingItems) return [];
    return editingItems
      .map((item) => reconstructCartLine(item, readyProducts, services, inventoryItems).line)
      .filter((line): line is CartLine => line !== null);
  });
  const [reconstructWarnings] = useState<string[]>(() => {
    if (!editingItems) return [];
    return editingItems
      .map((item) => reconstructCartLine(item, readyProducts, services, inventoryItems).warning)
      .filter((w): w is string => w !== null);
  });
  // النموذج على اليمين — بند واحد بيتصمم في المرة (نمط الفيديو)
  // FEATURE-009 (2026-08-13) — الأقسام الرئيسية والفرعية، مبنية على ORDER_ITEM_CATEGORIES.
  const [activeParentId, setActiveParentId] = useState('OFFSET');
  const [activeSubTabId, setActiveSubTabId] = useState<string | undefined>('LOOSE_PAPER');
  const [draft, setDraft] = useState<DraftItem>(() => emptyDraftItem());
  const [itemError, setItemError] = useState<string | null>(null);

  // التحصيل — دفعات عند الإنشاء (فاتورة فقط)
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'SAVE_ONLY' | 'SAVE_AND_PRINT' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // FEATURE-012 (2026-08-14, owner: "لو بدأت اعمل اوردر وخرجت يديني تحذير
  // إن الاوردر اللي بعمله دلوقتي هيتلغى") — warns before closing the tab/
  // refreshing/typing a new address once the cart or any order-level field
  // actually differs from the snapshot the form started with (captured once
  // during render, not in an effect, so it survives React StrictMode's
  // double-invoked effects in development without a false "changed" read on
  // mount). Opening an existing document for edit and immediately leaving
  // therefore doesn't warn either — only a real, human-made edit does.
  // Native `beforeunload` only fires on real page unload, not in-app
  // `navigate()` calls, so a successful save never triggers it.
  const trackedFields = { cart, payments, partnerId, branchId, productionTrack, deliveryDate, discountPercent, vatOn, customerNotes, internalNotes };
  const initialSnapshot = useRef<string | undefined>(undefined);
  if (initialSnapshot.current === undefined) {
    initialSnapshot.current = JSON.stringify(trackedFields);
  }
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  useEffect(() => {
    setHasUnsavedChanges(JSON.stringify(trackedFields) !== initialSnapshot.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, payments, partnerId, branchId, productionTrack, deliveryDate, discountPercent, vatOn, customerNotes, internalNotes]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const paperInventoryItems = useMemo(() => inventoryItems.filter((i) => i.sheetPrice !== null), [inventoryItems]);

  const ctx: PricingCtx = useMemo(
    () => ({
      families: pricingReference.sizeFamilies,
      pricingConstants: pricingReference.pricingConstants,
      boardsConstants: pricingReference.boardsConstants,
      digitalConstants: pricingReference.digitalConstants,
      sheetPriceByInventoryItemId: new Map(
        inventoryItems.filter((i) => i.sheetPrice !== null).map((i) => [i.id, i.sheetPrice as number]),
      ),
      catalogPriceById: new Map([
        ...readyProducts.map((p) => [p.id, p.price] as const),
        ...services.map((s) => [s.id, s.price] as const),
      ]),
    }),
    [pricingReference, inventoryItems, readyProducts, services],
  );

  const draftPreview = useMemo(() => previewItemTotal(draft, ctx), [draft, ctx]);
  const subtotal = cart.reduce((sum, line) => sum + line.total, 0);
  const discountNum = toNum(discountPercent);
  const afterDiscount = subtotal * (1 - discountNum / 100);
  const vatAmount = vatOn ? afterDiscount * (pricingReference.vatRate / 100) : 0;
  // تقريب المبلغ النهائي لأقرب رقم صحيح أعلى (نفس منطق السيرفر بالظبط).
  const finalTotal = Math.ceil(afterDiscount + vatAmount);
  const paidTotal = payments.reduce((sum, p) => sum + (toOptionalNum(p.amount) ?? 0), 0);
  const remainingBalance = finalTotal - paidTotal;

  const updateDraft = (patch: Partial<DraftItem>) => setDraft((prev) => ({ ...prev, ...patch }));

  const activeParent = ORDER_ITEM_CATEGORIES.find((c) => c.id === activeParentId) ?? ORDER_ITEM_CATEGORIES[0]!;
  const activeSubTab = activeParent.subTabs?.find((s) => s.id === activeSubTabId);
  const isPendingCategory = activeParent.status === 'pending';

  /** FEATURE-009 (2026-08-13) — selecting a parent (and its sub-tab, if any) resolves the real pricing `kind` and resets the draft to it, mirroring the old `switchTab`'s behavior exactly — just generalized from 2 flat tabs to 5 parent tabs (some with sub-tabs). Digital (`status: 'pending'`) never sets `draft.kind` — there's no pricing logic to build a form around yet. */
  const selectCategory = (parentId: string, subTabId?: string) => {
    const parent = ORDER_ITEM_CATEGORIES.find((c) => c.id === parentId);
    if (!parent) return;
    const resolvedSubTabId = subTabId ?? parent.subTabs?.[0]?.id;
    setActiveParentId(parentId);
    setActiveSubTabId(resolvedSubTabId);
    if (parent.status === 'pending') return;
    const kind = parent.kind ?? parent.subTabs?.find((s) => s.id === resolvedSubTabId)?.kind;
    if (kind) setDraft(emptyDraftItem(kind));
  };

  const familyEntries = (familyKey: string): SizeFamily['entries'] =>
    pricingReference.sizeFamilies.find((f) => f.key === familyKey)?.entries ?? [];

  const uploadAttachment = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      updateDraft({ attachmentError: 'حجم الصورة أكبر من 5MB' });
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      updateDraft({ attachmentError: 'نوع الملف غير مدعوم — JPG أو PNG أو WEBP فقط' });
      return;
    }
    updateDraft({ attachmentUploading: true, attachmentError: null });
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'ORDER_ITEM_REFERENCE');
      const attachment = await apiPostFormData<Attachment>('/api/attachments', fd);
      updateDraft({
        attachmentId: attachment.id,
        attachmentUrl: attachment.url,
        attachmentFileName: attachment.fileName,
        attachmentUploading: false,
      });
    } catch (err) {
      updateDraft({
        attachmentUploading: false,
        attachmentError: err instanceof Error ? err.message : 'تعذر رفع الصورة',
      });
    }
  };

  const addToCart = () => {
    const pricing = buildPricingInput(draft);
    if (!pricing) {
      setItemError('أكمل بيانات البند المطلوبة أولاً');
      return;
    }
    const preview = previewItemTotal(draft, ctx);
    if (preview.error) {
      setItemError(preview.error);
      return;
    }
    setItemError(null);
    const label = draft.itemType || KIND_LABELS[draft.kind];
    const line: CartLine = {
      key: draft.key,
      itemType: label,
      summary: describeDraft(draft, readyProducts, services),
      notes: draft.notes || undefined,
      inkColor: draft.inkColor || undefined,
      bindingType: draft.bindingType || undefined,
      sellophaneType: draft.sellophaneType || undefined,
      readyProductId: draft.kind === 'PRODUCT' ? draft.readyProductId || undefined : undefined,
      serviceId: draft.kind === 'SERVICE' ? draft.serviceId || undefined : undefined,
      attachmentId: draft.attachmentId || undefined,
      attachmentUrl: draft.attachmentUrl || undefined,
      pricing,
      total: preview.total,
    };
    setCart((prev) => [...prev, line]);
    setDraft(emptyDraftItem(activeParent.kind ?? activeSubTab?.kind ?? 'LOOSE_PAPER'));
  };

  const removeFromCart = (key: string) => setCart((prev) => prev.filter((line) => line.key !== key));

  const addPaymentRow = () => setPayments((prev) => [...prev, emptyPaymentRow()]);
  const updatePaymentRow = (key: string, patch: Partial<PaymentRow>) =>
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removePaymentRow = (key: string) => setPayments((prev) => prev.filter((p) => p.key !== key));

  const submit = async (intent: 'SAVE_ONLY' | 'SAVE_AND_PRINT') => {
    if (submitting) return;
    setError(null);

    // FEATURE-016 — the customer field is no longer a native `<select
    // required>` (now `PartnerCombobox`, a button/search combo with no
    // built-in HTML5 form validation), so this replaces that lost gate.
    if (!partnerId) {
      setError('اختر العميل أولًا');
      return;
    }

    if (cart.length === 0) {
      setError('أضف بندًا واحدًا على الأقل للفاتورة قبل الحفظ');
      return;
    }
    // Same item shape either way — `createQuotationItemSchema` and
    // `createOrderItemSchema` are structurally identical (FEATURE-007,
    // one Pricing Engine for both), so only the wrapping document differs.
    const outputItems = cart.map((line) => ({
      itemType: line.itemType,
      notes: line.notes,
      inkColor: line.inkColor,
      bindingType: line.bindingType,
      sellophaneType: line.sellophaneType,
      // `validateQuotationItemRefs` requires a description on any item
      // with no readyProductId/serviceId — reuse the same label the
      // user already typed (or the kind's default) rather than adding
      // a second, redundant free-text field to the form.
      description: line.readyProductId || line.serviceId ? undefined : line.itemType,
      readyProductId: line.readyProductId,
      serviceId: line.serviceId,
      attachmentId: line.attachmentId,
      pricing: line.pricing,
    }));

    setSubmitting(intent);
    try {
      if (isEditing && editQuotation) {
        const input: UpdateQuotationInput = {
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
          discountPercent: discountNum,
          vatOn,
          customerNotes: customerNotes || null,
          internalNotes: internalNotes || null,
          items: outputItems,
        };
        const quotation = await apiPut<Quotation>(`/api/quotations/${editQuotation.id}`, input);
        navigate(`/quotations/${quotation.id}`);
      } else if (documentType === 'QUOTATION') {
        const input: CreateQuotationInput = {
          partnerId,
          branchId,
          validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
          discountPercent: discountNum,
          vatOn,
          customerNotes: customerNotes || undefined,
          internalNotes: internalNotes || undefined,
          items: outputItems,
        };
        const quotation = await apiPost<Quotation>('/api/quotations', input);
        if (intent === 'SAVE_AND_PRINT') {
          navigate(`/quotations/${quotation.id}/print`);
        } else {
          onCreated({ type: 'QUOTATION', quotation });
        }
      } else if (isEditing && editOrder) {
        const input: UpdateOrderInput = {
          discountPercent: discountNum,
          vatOn,
          deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : null,
          customerNotes: customerNotes || null,
          internalNotes: internalNotes || null,
          productionTrack: productionTrack || null,
          requiresDesign,
          items: outputItems,
        };
        const order = await apiPut<Order>(`/api/orders/${editOrder.id}`, input);
        navigate(`/orders/${order.id}`);
      } else {
        const paymentInputs: CreatePaymentInput[] = payments
          .filter((p) => toOptionalNum(p.amount) && toNum(p.amount) > 0)
          .map((p) => ({ method: p.method, amount: toNum(p.amount) }));
        const input: CreateOrderInput = {
          partnerId,
          branchId,
          discountPercent: discountNum,
          vatOn,
          deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : undefined,
          customerNotes: customerNotes || undefined,
          internalNotes: internalNotes || undefined,
          productionTrack: productionTrack || undefined,
          requiresDesign,
          items: outputItems,
          payments: paymentInputs.length ? paymentInputs : undefined,
        };
        const order = await apiPost<Order>('/api/orders', input);
        if (intent === 'SAVE_AND_PRINT') {
          navigate(`/orders/${order.id}`);
        } else {
          onCreated({ type: 'INVOICE', order });
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditing
            ? 'تعذر حفظ التعديلات'
            : documentType === 'QUOTATION'
              ? 'تعذر إنشاء عرض السعر'
              : 'تعذر إنشاء الفاتورة',
      );
    } finally {
      setSubmitting(null);
    }
  };

  const navigate = useNavigate();
  const entries = familyEntries(draft.sizeFamilyKey);
  const selectedEntry = entries.find((e) => e.label === draft.realSizeLabel);
  const result = draftPreview.result;
  const isSheetKind = draft.kind === 'LOOSE_PAPER' || draft.kind === 'NOTEBOOK' || draft.kind === 'FOLDER';
  const hasPrintSection = draft.kind === 'LOOSE_PAPER' || draft.kind === 'NOTEBOOK' || draft.kind === 'ENVELOPE' || draft.kind === 'FOLDER';

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      {/* عمود شمال — السلة (بنود الفاتورة/العرض)، زي الفيديو بالظبط */}
      <aside className="border-border bg-card sticky top-4 order-2 h-fit space-y-3 rounded-2xl border p-4">
        <p className="flex items-center gap-1 text-sm font-bold">🛒 {documentType === 'QUOTATION' ? 'بنود عرض السعر' : 'بنود الفاتورة'}</p>

        {cart.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
            السلة فارغة. ابدأ بإضافة بنود.
          </p>
        ) : (
          <div className="space-y-2">
            {cart.map((line) => (
              <div key={line.key} className="border-border flex items-start justify-between gap-2 rounded-lg border p-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{money(line.total)} ج.م</p>
                  <p className="text-muted-foreground truncate text-xs">{line.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromCart(line.key)}
                  className="text-destructive shrink-0 text-xs"
                  aria-label="حذف البند"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}

        {/* نسبة الربح — تعديل يدوي اختياري (عايزة اقدر اعدلها وانا بطلب). موقعها اتنقل تحت قائمة بنود السلة نفسها (owner, 2026-08-13) — كانت قبل كده جوه نموذج تصميم البند نفسه، قبل "سعر البند" مباشرة. DIGITAL يشارك نفس نسبة الربح الافتراضية القابلة للتعديل (schema's `marginOverrideFields`) رغم إنه مش من كتلة hasPrintSection الأصلية (زنكات/تراج أوفست فقط). */}
        {(hasPrintSection || draft.kind === 'DIGITAL') && (
          <div className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <Checkbox
              checked={draft.profitPercentEnabled}
              onCheckedChange={(v) => updateDraft({ profitPercentEnabled: v === true })}
            />
            <span className="text-sm">نسبة الربح</span>
            {draft.profitPercentEnabled ? (
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={draft.profitPercentOverride}
                onChange={(e) => updateDraft({ profitPercentOverride: e.target.value })}
                className="border-input bg-background w-24 rounded-md border px-2 py-1 text-end text-sm"
              />
            ) : (
              <span className="text-muted-foreground text-xs">
                الافتراضي من الإعدادات: {pricingReference.pricingConstants.profitPercent}%
              </span>
            )}
          </div>
        )}

        <label className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">تطبيق ضريبة القيمة المضافة ({pricingReference.vatRate}%)</span>
          <input type="checkbox" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">نسبة الخصم %</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            className="border-input bg-background w-20 rounded-md border px-2 py-1 text-end text-sm"
          />
        </label>

        <div className="space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">الإجمالي قبل الخصم</span>
            <span>{money(subtotal)} ج.م</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">الخصم ({discountNum}%)</span>
            <span>-{money(subtotal - afterDiscount)} ج.م</span>
          </div>
          {vatOn && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">ضريبة القيمة المضافة</span>
              <span>{money(vatAmount)} ج.م</span>
            </div>
          )}
        </div>

        {/* الصندوق الأخضر الكبير — الإجمالي النهائي، محسوب لحظيًا بلا إعادة تحميل، زي الفيديو بالظبط */}
        <div className="bg-success/15 flex flex-col items-center gap-1 rounded-xl p-4 text-center">
          <span className="text-success text-xs font-medium">إجمالي الحساب</span>
          <span className="text-success text-3xl font-bold tabular-nums">{money(finalTotal)}</span>
          <span className="text-success text-xs">جنيه مصري</span>
        </div>

        {documentType === 'INVOICE' && !isEditing && (
          <div className="space-y-2 border-t pt-2">
            <p className="text-sm font-medium">التحصيل</p>
            {payments.map((p) => (
              <div key={p.key} className="flex items-center gap-1">
                <select
                  value={p.method}
                  onChange={(e) => updatePaymentRow(p.key, { method: e.target.value as PaymentMethod })}
                  className="border-input bg-background rounded-md border px-2 py-1.5 text-xs"
                >
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="المبلغ"
                  value={p.amount}
                  onChange={(e) => updatePaymentRow(p.key, { amount: e.target.value })}
                  className="border-input bg-background w-full min-w-0 rounded-md border px-2 py-1.5 text-end text-xs"
                />
                <button type="button" onClick={() => removePaymentRow(p.key)} className="text-destructive text-xs" aria-label="حذف الدفعة">
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={addPaymentRow} className="text-primary text-xs">
              + دفعة أخرى
            </button>
            <div className="space-y-1 pt-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">المدفوع:</span>
                <span className="text-success">{money(paidTotal)} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الباقي (أجل):</span>
                <span className="text-destructive">{money(Math.max(remainingBalance, 0))} ج.م</span>
              </div>
            </div>
          </div>
        )}

        {isEditing && editOrder && (
          <div className="space-y-1 border-t pt-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">المدفوع سابقًا:</span>
              <span className="text-success">{money(editOrder.paidTotal)} ج.م</span>
            </div>
            <p className="text-muted-foreground text-xs">الدفعات لا تتغير من هنا — لتسجيل دفعة جديدة استخدم صفحة الفاتورة.</p>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="space-y-2 border-t pt-2">
          {isEditing ? (
            <Button type="button" className="w-full" disabled={submitting !== null} onClick={() => void submit('SAVE_ONLY')}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
            </Button>
          ) : (
            <>
              <Button type="button" className="w-full" disabled={submitting !== null} onClick={() => void submit('SAVE_AND_PRINT')}>
                {submitting === 'SAVE_AND_PRINT' ? 'جارٍ الحفظ…' : '🖶 حفظ وطباعة'}
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={submitting !== null} onClick={() => void submit('SAVE_ONLY')}>
                {submitting === 'SAVE_ONLY' ? 'جارٍ الحفظ…' : 'حفظ فقط'}
              </Button>
            </>
          )}
        </div>
      </aside>

      {/* عمود يمين — نموذج إضافة بند + بيانات المستند */}
      <div className="order-1 space-y-4">
        <h1 className="text-2xl font-bold">
          {editOrder
            ? `تعديل الفاتورة ${editOrder.invoiceNumber}`
            : editQuotation
              ? `تعديل عرض السعر ${editQuotation.quotationNumber}`
              : 'الطلبات والمستندات'}
        </h1>

        {reconstructWarnings.length > 0 && (
          <div className="border-warning bg-warning/10 space-y-1 rounded-xl border p-3 text-sm">
            {reconstructWarnings.map((w, i) => (
              <p key={i} className="text-warning-foreground">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}

        {!isEditing && canInvoice && canQuotation && (
          <div className="border-border bg-muted/30 inline-flex rounded-lg border p-1 text-sm">
            <button
              type="button"
              onClick={() => setDocumentType('INVOICE')}
              className={`rounded-md px-4 py-1.5 font-medium ${documentType === 'INVOICE' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              فاتورة مباشرة
            </button>
            <button
              type="button"
              onClick={() => setDocumentType('QUOTATION')}
              className={`rounded-md px-4 py-1.5 font-medium ${documentType === 'QUOTATION' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              عرض سعر
            </button>
          </div>
        )}

        {/* بيانات الفاتورة/العرض والعميل */}
        <div className="border-primary/30 bg-card space-y-3 rounded-2xl border-2 p-4">
          <p className="flex items-center gap-1 text-sm font-bold">👤 بيانات {documentType === 'QUOTATION' ? 'عرض السعر' : 'الفاتورة'} والعميل</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">العميل</span>
              <div className="flex items-center gap-1">
                <PartnerCombobox partners={localPartners} value={partnerId} onChange={setPartnerId} disabled={isEditing} />
                {can('partners.create') && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddPartner(true)}>
                    + عميل جديد
                  </Button>
                )}
              </div>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">الفرع</span>
              <select
                required
                disabled={isEditing}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1 text-sm">
              <span className="text-muted-foreground">تاريخ العملية</span>
              <p className="border-input bg-muted/30 rounded-md border px-3 py-2" dir="ltr">
                {new Date().toLocaleDateString('en-GB')}
              </p>
            </div>
            <div className="space-y-1 text-sm">
              <span className="text-muted-foreground">{documentType === 'QUOTATION' ? 'رقم عرض السعر' : 'رقم الفاتورة'}</span>
              <p className="border-input bg-muted/30 text-muted-foreground rounded-md border px-3 py-2">
                {editOrder?.invoiceNumber ?? editQuotation?.quotationNumber ?? 'يُحدَّد تلقائيًا بعد الحفظ'}
              </p>
            </div>
            {documentType === 'QUOTATION' ? (
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">صالح حتى (اختياري)</span>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            ) : (
              <>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">تاريخ التسليم (اختياري)</span>
                  <input
                    type="date"
                    value={deliveryDate}
                    min={(editOrder?.date ?? new Date().toISOString()).slice(0, 10)}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">المسار الإنتاجي (اختياري)</span>
                  <select
                    value={productionTrack}
                    onChange={(e) => setProductionTrack(e.target.value as ProductionTrack | '')}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="">— بدون —</option>
                    {PRODUCTION_TRACK_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {PRODUCTION_TRACK_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                {(productionTrack === 'OFFSET' || productionTrack === 'DIGITAL') && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={requiresDesign}
                      onChange={(e) => setRequiresDesign(e.target.checked)}
                    />
                    <span>يحتاج تصميم؟</span>
                  </label>
                )}
              </>
            )}
          </div>
        </div>

        {/* FEATURE-009 (2026-08-13) — الأقسام الرئيسية: أوفست / ديجيتال / لوحات وإعلانات / خدمات / منتجات جاهزة */}
        <div className="border-border bg-muted/30 inline-flex flex-wrap gap-1 rounded-lg border p-1 text-sm">
          {ORDER_ITEM_CATEGORIES.map((parent) => (
            <button
              key={parent.id}
              type="button"
              onClick={() => selectCategory(parent.id)}
              className={`rounded-md px-4 py-1.5 font-medium ${activeParentId === parent.id ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              {parent.label}
              {parent.status === 'pending' && <span className="text-muted-foreground text-xs"> (قريبًا)</span>}
            </button>
          ))}
        </div>

        {activeParent.subTabs && (
          <div className="border-border bg-muted/20 inline-flex flex-wrap gap-1 rounded-lg border p-1 text-xs">
            {activeParent.subTabs.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => selectCategory(activeParentId, sub.id)}
                className={`rounded-md px-3 py-1 font-medium ${activeSubTabId === sub.id ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}

        <div className="border-border bg-card space-y-4 rounded-2xl border p-4">
          {itemError && <div className="text-destructive text-sm">{itemError}</div>}

          {isPendingCategory ? (
            <p className="text-muted-foreground text-sm">منطق التسعير الخاص بـ{activeParent.label} هيتحدد لاحقًا — قريبًا.</p>
          ) : (
            <>

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">اسم البند / العملية</span>
            <input
              value={draft.itemType}
              onChange={(e) => updateDraft({ itemType: e.target.value })}
              placeholder="مثال: فلايرز، كروت شخصية..."
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          {isSheetKind && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">مجموعة المقاس</span>
                <select
                  value={draft.sizeFamilyKey}
                  onChange={(e) => updateDraft({ sizeFamilyKey: e.target.value, realSizeLabel: '' })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">— اختر الورق أولًا —</option>
                  {pricingReference.sizeFamilies.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">المقاس</span>
                <select
                  value={draft.realSizeLabel}
                  onChange={(e) => updateDraft({ realSizeLabel: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">— المقاس —</option>
                  {entries.map((en) => (
                    <option key={en.label} value={en.label}>
                      {en.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">نوع الورق (يُسحب من المخزن)</span>
                <select
                  value={draft.inventoryItemId}
                  onChange={(e) => updateDraft({ inventoryItemId: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">— بدون ورق —</option>
                  {paperInventoryItems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {draft.kind === 'LOOSE_PAPER' && (
            <label className="block max-w-xs space-y-1 text-sm">
              <span className="text-muted-foreground">الكمية المطلوبة</span>
              <input
                type="number"
                min={1}
                value={draft.quantity}
                onChange={(e) => updateDraft({ quantity: e.target.value })}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          )}

          {isSheetKind && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">عدد الألوان</span>
                <input
                  type="number"
                  min={1}
                  value={draft.colorCount}
                  onChange={(e) => updateDraft({ colorCount: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              {(draft.kind === 'LOOSE_PAPER' || draft.kind === 'FOLDER') && (
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">عدد الوجوه</span>
                  <select
                    value={draft.sides}
                    onChange={(e) => updateDraft({ sides: e.target.value as '1' | '2' })}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="1">وجه واحد</option>
                    <option value="2">وجهين</option>
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" checked={draft.isNewDesign} onChange={(e) => updateDraft({ isNewDesign: e.target.checked })} />
                تصميم جديد
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">بداية الترقيم (اختياري)</span>
                <input
                  type="number"
                  min={1}
                  value={draft.numberingStartNumber}
                  onChange={(e) => updateDraft({ numberingStartNumber: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {/* صيغة تكلفة الورق الحية — نفس أرقام الفيديو، مبنية من نفس breakdown اللي المحرك بيرجّعه أصلًا */}
          {isSheetKind && result && typeof result.sheetsNeeded === 'number' && (
            <p className="bg-muted/40 rounded-md p-2 text-xs" dir="rtl">
              الكمية ({draft.kind === 'NOTEBOOK' ? draft.notebookQuantity : draft.quantity})
              {selectedEntry ? ` ÷ القطع في الفرخ (${selectedEntry.piecesPerSheet})` : ''} + الهالك (
              {pricingReference.pricingConstants.wasteSheetsDefault}) = {result.sheetsNeeded} فرخ ×{' '}
              {(ctx.sheetPriceByInventoryItemId.get(draft.inventoryItemId) ?? 0).toFixed(2)} = {money(result.paperCost ?? 0)} ج.م
            </p>
          )}

          {draft.kind === 'NOTEBOOK' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">عدد الدفاتر</span>
                <input
                  type="number"
                  min={1}
                  value={draft.notebookQuantity}
                  onChange={(e) => updateDraft({ notebookQuantity: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">المحتوى</span>
                <select
                  value={draft.contentType}
                  onChange={(e) => updateDraft({ contentType: e.target.value as DraftItem['contentType'] })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="ORIGINAL_ONLY">أصل فقط</option>
                  <option value="ORIGINAL_PLUS_COPIES">أصل + كربون</option>
                </select>
              </label>
              {draft.contentType === 'ORIGINAL_PLUS_COPIES' && (
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">عدد نسخ الكربون</span>
                  <input
                    type="number"
                    min={1}
                    value={draft.copies}
                    onChange={(e) => updateDraft({ copies: e.target.value })}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
              )}
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">سعر التجليد للدفتر</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.bindingPricePerNotebook}
                  onChange={(e) => updateDraft({ bindingPricePerNotebook: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {draft.kind === 'ENVELOPE' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">الكمية</span>
                <input
                  type="number"
                  min={1}
                  value={draft.quantity}
                  onChange={(e) => updateDraft({ quantity: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">عدد الألوان</span>
                <input
                  type="number"
                  min={1}
                  value={draft.colorCount}
                  onChange={(e) => updateDraft({ colorCount: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">سعر الظرف الجاهز/قطعة</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.readyEnvelopePricePerPiece}
                  onChange={(e) => updateDraft({ readyEnvelopePricePerPiece: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" checked={draft.isNewDesign} onChange={(e) => updateDraft({ isNewDesign: e.target.checked })} />
                تصميم جديد
              </label>
            </div>
          )}

          {draft.kind === 'FOLDER' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">الكمية</span>
                <input
                  type="number"
                  min={1}
                  value={draft.quantity}
                  onChange={(e) => updateDraft({ quantity: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={draft.sellophaneEnabled}
                  onChange={(e) => updateDraft({ sellophaneEnabled: e.target.checked })}
                />
                سلوفان
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">ريزا</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.riza}
                  onChange={(e) => updateDraft({ riza: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">جراب داخلي</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.jarab}
                  onChange={(e) => updateDraft({ jarab: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">فورمة</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.forma}
                  onChange={(e) => updateDraft({ forma: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">تكسير وتلزيق</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.taksir}
                  onChange={(e) => updateDraft({ taksir: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {draft.kind === 'BOARDS' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">الخامة</span>
                <select
                  value={draft.material}
                  onChange={(e) => updateDraft({ material: e.target.value as BoardMaterial })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  {BOARD_MATERIAL_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {BOARD_MATERIAL_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">العرض (سم)</span>
                <input
                  type="number"
                  min={1}
                  value={draft.widthCm}
                  onChange={(e) => updateDraft({ widthCm: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">الارتفاع (سم)</span>
                <input
                  type="number"
                  min={1}
                  value={draft.heightCm}
                  onChange={(e) => updateDraft({ heightCm: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">الكمية</span>
                <input
                  type="number"
                  min={1}
                  value={draft.quantity}
                  onChange={(e) => updateDraft({ quantity: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              {draft.material === 'BANNER' && (
                <label className="flex items-center gap-2 self-end text-sm">
                  <input type="checkbox" checked={draft.hasDesign} onChange={(e) => updateDraft({ hasDesign: e.target.checked })} />
                  تصميم
                </label>
              )}
              {(draft.material === 'VINYL_NORMAL' || draft.material === 'VINYL_PRINT_CUT') && (
                <label className="flex items-center gap-2 self-end text-sm">
                  <input
                    type="checkbox"
                    checked={draft.hasSellophane}
                    onChange={(e) => updateDraft({ hasSellophane: e.target.checked })}
                  />
                  سلوفان
                </label>
              )}
            </div>
          )}

          {draft.kind === 'DIGITAL' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">نوع الورق (يُسحب من المخزن)</span>
                <select
                  value={draft.inventoryItemId}
                  onChange={(e) => updateDraft({ inventoryItemId: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">— اختر —</option>
                  {paperInventoryItems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">عرض القطعة (سم)</span>
                <input
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={draft.widthCm}
                  onChange={(e) => {
                    const widthCm = e.target.value;
                    const w = Number(widthCm);
                    const h = Number(draft.heightCm);
                    const suggested =
                      w > 0 && h > 0
                        ? suggestYield(
                            w,
                            h,
                            pricingReference.digitalConstants.digitalQuarterWidthCm,
                            pricingReference.digitalConstants.digitalQuarterHeightCm,
                          )
                        : 0;
                    updateDraft({ widthCm, yieldPerQuarter: suggested > 0 ? String(suggested) : draft.yieldPerQuarter });
                  }}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">ارتفاع القطعة (سم)</span>
                <input
                  type="number"
                  min={0.1}
                  step="0.1"
                  value={draft.heightCm}
                  onChange={(e) => {
                    const heightCm = e.target.value;
                    const w = Number(draft.widthCm);
                    const h = Number(heightCm);
                    const suggested =
                      w > 0 && h > 0
                        ? suggestYield(
                            w,
                            h,
                            pricingReference.digitalConstants.digitalQuarterWidthCm,
                            pricingReference.digitalConstants.digitalQuarterHeightCm,
                          )
                        : 0;
                    updateDraft({ heightCm, yieldPerQuarter: suggested > 0 ? String(suggested) : draft.yieldPerQuarter });
                  }}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">الكمية</span>
                <input
                  type="number"
                  min={1}
                  value={draft.quantity}
                  onChange={(e) => updateDraft({ quantity: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">التنزيلة (Yield) — عدد القطع في الربع</span>
                <input
                  type="number"
                  min={1}
                  value={draft.yieldPerQuarter}
                  onChange={(e) => updateDraft({ yieldPerQuarter: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={draft.sellophaneEnabled}
                  onChange={(e) => updateDraft({ sellophaneEnabled: e.target.checked })}
                />
                سلوفان
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">سعر البشر للقطعة (اختياري)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.boshrPricePerPiece}
                  onChange={(e) => updateDraft({ boshrPricePerPiece: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {/* صيغة تكلفة الديجيتال الحية — نظام التنزيلة، system_specifications_v2.md §13.3 */}
          {draft.kind === 'DIGITAL' && result && typeof result.costPerPiece === 'number' && (
            <p className="bg-muted/40 rounded-md p-2 text-xs" dir="rtl">
              {result.fitsInQuarter === false && result.unitsNeeded
                ? `القطعة أكبر من الربع — محتاجة ${result.unitsNeeded} ربع/قطعة`
                : `التنزيلة: ${draft.yieldPerQuarter} قطعة في الربع`}
              {' — '}تكلفة القطعة {money(result.costPerPiece)} ج.م × الكمية ({draft.quantity}) = {money(result.subtotal ?? 0)} ج.م
            </p>
          )}

          {draft.kind === 'PRODUCT' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">المنتج</span>
                <select
                  value={draft.readyProductId}
                  onChange={(e) => updateDraft({ readyProductId: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">— اختر —</option>
                  {readyProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.sourceType ? ` (${PRODUCT_SOURCE_TYPE_LABELS[p.sourceType]})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">الكمية</span>
                <input
                  type="number"
                  min={1}
                  value={draft.quantity}
                  onChange={(e) => updateDraft({ quantity: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {draft.kind === 'SERVICE' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">الخدمة</span>
                <select
                  value={draft.serviceId}
                  onChange={(e) => updateDraft({ serviceId: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">— اختر —</option>
                  {services
                    .filter((s) => !activeSubTab?.serviceCategory || s.category === activeSubTab.serviceCategory)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">الكمية</span>
                <input
                  type="number"
                  min={1}
                  value={draft.quantity}
                  onChange={(e) => updateDraft({ quantity: e.target.value })}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {/* صيغة تكلفة الطباعة الحية */}
          {hasPrintSection && result && (typeof result.zincCost === 'number' || typeof result.printCost === 'number') && (
            <p className="bg-muted/40 rounded-md p-2 text-xs" dir="rtl">
              الزنكات: {draft.colorCount} × {pricingReference.pricingConstants.zincPrice} = {money(result.zincCost ?? 0)} ج.م — التراجات:{' '}
              {result.printRuns ?? 0} × {pricingReference.pricingConstants.printRunPrice} = {money(result.printCost ?? 0)} ج.م
            </p>
          )}

          {/* الخدمات الإضافية */}
          <div className="space-y-2">
            <p className="text-sm font-medium">الخدمات الإضافية</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {EXTRA_SERVICE_DEFS.map((def) => {
                const enabled = draft[def.enabledKey];
                return (
                  <div key={def.enabledKey} className="border-border flex flex-col gap-1 rounded-lg border p-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={enabled} onCheckedChange={(v) => updateDraft({ [def.enabledKey]: v === true } as Partial<DraftItem>)} />
                      {def.label}
                    </label>
                    {enabled && (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="المبلغ"
                        value={draft[def.amountKey]}
                        onChange={(e) => updateDraft({ [def.amountKey]: e.target.value } as Partial<DraftItem>)}
                        className="border-input bg-background w-full rounded-md border px-2 py-1 text-end text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {hasPrintSection && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">لون الحبر (اختياري)</span>
                <input
                  value={draft.inkColor}
                  onChange={(e) => updateDraft({ inkColor: e.target.value })}
                  placeholder="مثال: أزرق غامق PMS 286"
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">نوع التجليد (اختياري)</span>
                <input
                  value={draft.bindingType}
                  onChange={(e) => updateDraft({ bindingType: e.target.value })}
                  placeholder="مثال: دبوس، سلك حلزوني..."
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">نوع السلوفان (اختياري)</span>
                <input
                  value={draft.sellophaneType}
                  onChange={(e) => updateDraft({ sellophaneType: e.target.value })}
                  placeholder="مثال: لامع، مطفي..."
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">ملاحظات أمر الشغل (تظهر في الطباعة)</span>
            <textarea
              value={draft.notes}
              onChange={(e) => updateDraft({ notes: e.target.value })}
              rows={2}
              placeholder="اكتب ملاحظات للعامل... مثال: الطباعة وجهين، لون أحمر بالتون، قص بعد الطباعة..."
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>

          {/* صورة المنتج — رفع اختياري لمرجعية التصميم */}
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">صورة المنتج (اختياري — لمرجعية التصميم)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAttachment(file);
                e.target.value = '';
              }}
            />
            {draft.attachmentUrl ? (
              <div className="border-border flex items-center gap-3 rounded-xl border border-dashed p-3">
                <img src={draft.attachmentUrl} alt="" className="size-16 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{draft.attachmentFileName}</p>
                  <button
                    type="button"
                    onClick={() => updateDraft({ attachmentId: '', attachmentUrl: '', attachmentFileName: '' })}
                    className="text-destructive text-xs"
                  >
                    إزالة الصورة
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) void uploadAttachment(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="border-border hover:bg-muted/30 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center"
              >
                <span>📤</span>
                <span className="text-sm">{draft.attachmentUploading ? 'جارٍ الرفع…' : 'اضغط لاختيار صورة أو اسحبها هنا'}</span>
                <span className="text-muted-foreground text-xs">5MB بحد أقصى — JPG, PNG, WEBP</span>
              </div>
            )}
            {draft.attachmentError && <p className="text-destructive text-xs">{draft.attachmentError}</p>}
          </div>

          <div className="flex items-center justify-between border-t pt-2">
            <p className="text-sm font-medium">
              سعر البند:{' '}
              <span className={draftPreview.error ? 'text-destructive' : 'text-foreground'}>
                {draftPreview.error ?? `${money(draftPreview.total)} ج.م`}
              </span>
            </p>
            <Button type="button" onClick={addToCart}>
              🛒 إضافة للفاتورة
            </Button>
          </div>
            </>
          )}
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">ملاحظات العميل</span>
          <textarea
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
            rows={2}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">ملاحظات داخلية (لا تظهر للعميل)</span>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      </div>

      {showAddPartner && (
        <QuickAddPartnerDialog
          branchId={branchId}
          onClose={() => setShowAddPartner(false)}
          onCreated={(partner) => {
            setLocalPartners((prev) => [...prev, partner]);
            setPartnerId(partner.id);
            setShowAddPartner(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * FEATURE-007 — quick "+ عميل جديد" (owner, 2026-08-12: عايز اقدر اضيف
 * عميل من شاشة الطلب على طول). A real, saved `BusinessPartner` row (never
 * a local-only draft — the owner was explicit it must persist), just with
 * a minimal field set (name + phone) instead of the full Partner Profile
 * form; anything else can be filled in later from `/partners/:id`.
 */
function QuickAddPartnerDialog({
  branchId,
  onClose,
  onCreated,
}: {
  branchId: string;
  onClose: () => void;
  onCreated: (partner: BusinessPartner) => void;
}) {
  const [nameAr, setNameAr] = useState('');
  const [phone, setPhone] = useState('');
  const [isIndividual, setIsIndividual] = useState(false);
  const [gender, setGender] = useState<Gender | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const partner = await apiPost<BusinessPartner>('/api/partners', {
        nameAr,
        phone: phone || undefined,
        branchId,
        roles: ['CUSTOMER'],
        isIndividual,
        gender: isIndividual ? gender || undefined : undefined,
      });
      onCreated(partner);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة العميل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>عميل جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">اسم العميل</span>
            <input
              required
              autoFocus
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">الهاتف (اختياري)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isIndividual} onChange={(e) => setIsIndividual(e.target.checked)} />
            فرد (وليس جهة/مؤسسة)
          </label>
          {isIndividual && (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">الجنس (لتحديد السيد/السيدة في المستندات)</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender | '')}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">غير محدد</option>
                <option value="MALE">ذكر (السيد)</option>
                <option value="FEMALE">أنثى (السيدة)</option>
              </select>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ العميل'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
