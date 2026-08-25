import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  Attachment,
  BoardMaterial,
  BranchSummary,
  BusinessPartner,
  CreateOrderInput,
  CreateOrderItemInput,
  CreateOrderTemplateInput,
  CreatePaymentInput,
  CreateQuotationInput,
  CreateTreasuryEntryInput,
  DigitalColorMode,
  DigitalPriceTierDto,
  DigitalPrintBasis,
  DigitalSides,
  ExtraServiceOption,
  Gender,
  InventoryItem,
  Order,
  OrderItemPricingInput,
  OrderTemplate,
  PaymentMethod,
  PricingReference,
  ProductionTrack,
  QuickInventorySaleInput,
  Quotation,
  ReadyProduct,
  Service,
  SizeFamily,
  TreasuryCategory,
  UpdateOrderInput,
  UpdateQuotationInput,
  WorkflowTemplate,
  WorkOrder,
} from '@cleopatra/shared';
import {
  calculateBoardsCost,
  calculateDigitalMultiComponentCost,
  calculateEnvelopeCost,
  calculateFolderCost,
  calculateLoosePaperCost,
  calculateNotebookMultiMaterialCost,
  calculateProductOrServiceCost,
  suggestYield,
} from '@cleopatra/shared';
import { findCategoryForKind, ORDER_ITEM_CATEGORIES, PRODUCTION_TRACK_LABELS, resolveProductionTrackForTab } from '@cleopatra/shared';
import { apiGet, apiPost, apiPostFormData, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Combobox, InventoryItemCombobox, PartnerCombobox, useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

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
  INVENTORY_RETAIL: 'بضاعة من المخزون',
  MANUAL: 'بند يدوي',
};

/**
 * Owner (2026-08-20, "فاتورة بدون إسم العميل... ده عميل مش ثابت ومش هحتاج
 * احطه اصلا في الداتا بيز") — a walk-in/cash sale skips the customer field
 * entirely, but only when every cart item is one of these two kinds
 * (nothing produced, nothing that needs a customer to track). Mirrors
 * `orderService.ts`'s `WALK_IN_ALLOWED_KINDS` exactly — server-side is the
 * real enforcement, this is just the matching client-side guard so the
 * error surfaces before a failed submit.
 */
const WALK_IN_ALLOWED_KINDS = new Set<PricingKind>(['INVENTORY_RETAIL', 'MANUAL']);

/**
 * "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — which tracks' seeded
 * WorkflowTemplate starts with a skippable Design stage, i.e. which
 * tracks the "يحتاج تصميم؟" toggle is even meaningful for. Hardcoded here
 * rather than fetched (would need an extra API round-trip just for this
 * one UI toggle) — must be kept in sync with `seed.ts`'s stage `canSkip`
 * flags if a track's template changes later.
 */
const SKIPPABLE_DESIGN_TRACKS: ReadonlySet<ProductionTrack> = new Set(['OFFSET', 'DIGITAL', 'SUBLIMATION_GIFTS']);

/**
 * Multi-material notebooks (2026-08-17, owner: "هختار نوع الورق لكل نسخة")
 * — Arabic label for a NOTEBOOK material role, shown on the live preview
 * and (via WorkOrderDocumentPage) the printed job-card. `role` is either
 * `'ORIGINAL'` or `COPY_${n}` (1-indexed, one per copy — no fixed count).
 */
function notebookMaterialRoleLabel(role: string): string {
  if (role === 'ORIGINAL') return 'الأصل';
  const match = /^COPY_(\d+)$/.exec(role);
  return match ? `نسخة ${match[1]}` : role;
}

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
 * The "الخدمات الإضافية" checkbox grid — owner (2026-08-17, "عايز في
 * الإعدادات أقدر أضيف على الخدمات الإضافية خدمة") — was a hardcoded
 * 4-option array here, now rendered from `draft.extraServices`, itself
 * built from the admin-managed `ExtraServiceOption` catalog (`extraServiceOptions`
 * state, fetched from `/api/extra-service-options`). No fixed catalog
 * price exists for any option — a checkbox just reveals the amount field,
 * always caller-entered per item, same as before this change.
 */

/** One DIGITAL component's own draft fields (2026-08-17; extended 2026-08-20 with printBasis/colorMode/sides — see digitalCostCalculation.ts's doc comment) — a magazine's cover/interior each get their own machine/size/material, computed fully independently then summed. */
interface DraftDigitalComponent {
  key: string;
  label: string;
  inventoryItemId: string;
  printBasis: DigitalPrintBasis;
  colorMode: DigitalColorMode;
  sides: DigitalSides;
  widthCm: string;
  heightCm: string;
  quantity: string;
  yieldPerQuarter: string;
  sellophaneEnabled: boolean;
  boshrPricePerPiece: string;
}

let digitalComponentKeySeq = 0;
function emptyDigitalComponent(label = ''): DraftDigitalComponent {
  digitalComponentKeySeq += 1;
  return {
    key: `digital-component-${digitalComponentKeySeq}`,
    label,
    inventoryItemId: '',
    printBasis: 'QUARTER',
    colorMode: 'COLOR',
    sides: 'SINGLE',
    widthCm: '',
    heightCm: '',
    quantity: '1',
    yieldPerQuarter: '',
    sellophaneEnabled: false,
    boshrPricePerPiece: '0',
  };
}

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
  /**
   * Multi-material notebooks (2026-08-17, owner: "هختار نوع الورق لكل نسخة
   * في الدفتر") — one independently-choosable paper per copy, `copyMaterials[i]`
   * is copy #`i+1`'s override (empty = "same paper as the original"
   * `inventoryItemId` above, matching today's single-material behavior
   * exactly). Kept in sync with `copies` (resized whenever it changes) —
   * see `resizeCopyMaterials` below.
   */
  copyMaterials: string[];
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
  // DIGITAL — multi-component (2026-08-17, owner: "الغلاف بتاعها خامة
  // والداخلي خامة تانية"). Always at least one component; each is priced
  // fully independently and summed (see `calculateDigitalMultiComponentCost`).
  digitalComponents: DraftDigitalComponent[];
  // نسبة الربح — تعديل يدوي اختياري بدل النسبة الافتراضية من الإعدادات (LOOSE_PAPER/NOTEBOOK/ENVELOPE/FOLDER فقط — BOARDS/PRODUCT/SERVICE لا هامش ربح فيهم أصلًا).
  profitPercentEnabled: boolean;
  profitPercentOverride: string;
  /**
   * Owner (2026-08-17, "عايز أقدر أعدل سعر الزنك وتراج الطبع وترقيم
   * والتصميم من واجهة الطلبات... ساعات بحتاج أغير لما احب أحسب مناقصة")
   * — same "toggle + override field, defaults to the Settings value"
   * pattern as نسبة الربح above, one pair per overridable cost component.
   * زنك/تراج/تصميم apply to LOOSE_PAPER/NOTEBOOK/ENVELOPE/FOLDER; ترقيم/هالك
   * only to LOOSE_PAPER/NOTEBOOK (the only two kinds with either concept).
   */
  zincPriceOverrideEnabled: boolean;
  zincPriceOverrideValue: string;
  printRunPriceOverrideEnabled: boolean;
  printRunPriceOverrideValue: string;
  numberingRunPriceOverrideEnabled: boolean;
  numberingRunPriceOverrideValue: string;
  designCostOverrideEnabled: boolean;
  designCostOverrideValue: string;
  wasteSheetsOverrideEnabled: boolean;
  wasteSheetsOverrideValue: string;
  /**
   * Owner (2026-08-26, "أكتب السعر النهائي يدويًا للصنف ده"، same day:
   * "في نقطة لازم النسبة تكون موجودة بردو... ده وده وانا اختار") — a
   * manual price adjustment for BOARDS/PRODUCT/SERVICE/INVENTORY_RETAIL,
   * the only 4 kinds with no price-override concept until now (no profit
   * margin to hook into like LOOSE_PAPER/NOTEBOOK/etc.). Two mutually
   * exclusive modes the staff member picks between: `FLAT` types the final
   * per-unit price directly (`pricePerMeterOverride`/`unitPriceOverride`);
   * `PERCENT` types a markup/markdown percentage applied on top of the
   * catalog/computed price instead (`pricePerMeterMarkupPercent`/
   * `unitPriceMarkupPercent`) — less error-prone than computing the final
   * number by hand when the ask is just "+10%". BOARDS reads/writes the
   * per-meter fields, PRODUCT/SERVICE/INVENTORY_RETAIL the per-piece ones;
   * `priceOverrideValue` is shared since a draft is always exactly one kind.
   */
  priceOverrideEnabled: boolean;
  priceOverrideMode: 'FLAT' | 'PERCENT';
  priceOverrideValue: string;
  /**
   * Owner (2026-08-17, "عايز انا اللي اقولك مقاس الطباعة... وتحسب بناءا
   * عليه عدد الأفرخ وكذلك عدد التراجات" / "بالنسبة للترقيم عايز بردو
   * انا اللي اقولك مقاس الترقيم") — manual print-size / numbering-size
   * overrides, same "toggle + value, defaults to automatic" pattern as
   * the cost overrides above. Same-day follow-up ("لا يحصرني في المقاسات
   * الموجودة"): free-text, not limited to the family's own real-size
   * labels — any "عرض×ارتفاع" string works (`entries` below is offered
   * as `<datalist>` suggestions only, not a hard constraint). مقاس
   * الطباعة applies to LOOSE_PAPER/NOTEBOOK/FOLDER; مقاس الترقيم only to
   * LOOSE_PAPER/NOTEBOOK (the only kinds with a numbering concept).
   */
  calcSizeOverrideEnabled: boolean;
  calcSizeOverrideValue: string;
  numberingSizeOverrideEnabled: boolean;
  numberingSizeOverrideValue: string;
  /**
   * Owner (2026-08-17, "عايز اقدر أعدل على عدد الورق الداخلي للدفتر...
   * ممكن يكون 100 للأصل و100 للصورة... ممكن يكون 50 أصل فقط") — manual
   * override of the per-notebook page counts, defaults to 100
   * (ORIGINAL_ONLY) / 50+50-per-copy (ORIGINAL_PLUS_COPIES) when off.
   * NOTEBOOK only.
   */
  originalPagesOverrideEnabled: boolean;
  originalPagesOverrideValue: string;
  copyPagesOverrideEnabled: boolean;
  copyPagesOverrideValue: string;
  /**
   * الخدمات الإضافية — every kind. Owner (2026-08-17, "عايز في الإعدادات
   * أقدر أضيف على الخدمات الإضافية خدمة") — was 4 fixed checkboxes, now
   * one row per active `ExtraServiceOption` from the admin-managed catalog
   * (`extraServiceOptions`), built fresh in `emptyDraftItem`/on catalog
   * load so a newly added option shows up without a page reload once
   * re-fetched.
   */
  extraServices: { optionId: string; label: string; enabled: boolean; amount: string }[];
  // صورة المنتج (اختياري)
  attachmentId: string;
  attachmentUrl: string;
  attachmentFileName: string;
  attachmentUploading: boolean;
  attachmentError: string | null;
  // MANUAL — owner (2026-08-20, "اقدر ازود على الفاتورة حركة اكتبها يدوي
  // زي حركات الخزينة"): a free-text line (itemType above is its label),
  // no formula — this is the whole price, quantity reuses the shared
  // `quantity` field above.
  unitPrice: string;
  // Owner (2026-08-23, "تخفيض على صنف محدد وليس بالضرورة كل الفاتورة") —
  // universal, every kind, stacks with the order-level discountPercent.
  discountAmount: string;
  // Owner (2026-08-23, "اكتب اسم المورد منين وانا بطلب؟") — READY_PRODUCTS
  // only (shown for the "منتجات جاهزة" tab specifically); pre-fills the
  // "الإحضار من المورد" stage's assigned supplier once production reaches it.
  preferredSupplierId: string;
}

let draftKeySeq = 0;
function emptyDraftItem(kind: PricingKind = 'LOOSE_PAPER', extraServiceOptions: ExtraServiceOption[] = []): DraftItem {
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
    copyMaterials: [],
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
    digitalComponents: [emptyDigitalComponent()],
    profitPercentEnabled: false,
    profitPercentOverride: '0',
    zincPriceOverrideEnabled: false,
    zincPriceOverrideValue: '0',
    printRunPriceOverrideEnabled: false,
    printRunPriceOverrideValue: '0',
    numberingRunPriceOverrideEnabled: false,
    numberingRunPriceOverrideValue: '0',
    designCostOverrideEnabled: false,
    designCostOverrideValue: '0',
    wasteSheetsOverrideEnabled: false,
    wasteSheetsOverrideValue: '0',
    priceOverrideEnabled: false,
    priceOverrideMode: 'FLAT',
    priceOverrideValue: '0',
    calcSizeOverrideEnabled: false,
    calcSizeOverrideValue: '',
    numberingSizeOverrideEnabled: false,
    numberingSizeOverrideValue: '',
    originalPagesOverrideEnabled: false,
    originalPagesOverrideValue: '',
    copyPagesOverrideEnabled: false,
    copyPagesOverrideValue: '',
    extraServices: extraServiceOptions.map((o) => ({ optionId: o.id, label: o.label, enabled: false, amount: '0' })),
    attachmentId: '',
    attachmentUrl: '',
    attachmentFileName: '',
    attachmentUploading: false,
    attachmentError: null,
    unitPrice: '',
    discountAmount: '0',
    preferredSupplierId: '',
  };
}

const toNum = (v: string): number => (v.trim() === '' ? 0 : Number(v));
const toOptionalNum = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));

function extraServiceFieldsOf(d: DraftItem) {
  const enabled = d.extraServices.filter((s) => s.enabled && toNum(s.amount) > 0);
  return { extraServices: enabled.length > 0 ? enabled.map((s) => ({ label: s.label, amount: toNum(s.amount) })) : undefined };
}

/**
 * Owner (2026-08-26) — BOARDS/PRODUCT/SERVICE/INVENTORY_RETAIL's manual
 * price adjustment, `FLAT` (flatKey) or `PERCENT` (percentKey) mode. Named
 * per-kind at the call site (`pricePerMeterOverride`/
 * `pricePerMeterMarkupPercent` for BOARDS, `unitPriceOverride`/
 * `unitPriceMarkupPercent` for the other three) since the two field pairs
 * aren't interchangeable on `OrderItemPricingInput`.
 */
function priceOverrideFieldsOf(
  d: DraftItem,
  flatKey: 'pricePerMeterOverride' | 'unitPriceOverride',
  percentKey: 'pricePerMeterMarkupPercent' | 'unitPriceMarkupPercent',
): Record<string, number> {
  if (!d.priceOverrideEnabled) return {};
  return d.priceOverrideMode === 'FLAT' ? { [flatKey]: toNum(d.priceOverrideValue) } : { [percentKey]: toNum(d.priceOverrideValue) };
}

/** Client mirror of `pricingEngineService.ts`'s `sumExtraCosts`, used only for the live preview. MANUAL has no `extraServices` concept at all (see its own schema comment) — `in` narrows that out instead of a structural type every kind would otherwise need to share at least one property with. */
function sumExtraCosts(pricing: OrderItemPricingInput): number {
  if (!('extraServices' in pricing) || !pricing.extraServices) return 0;
  return pricing.extraServices.reduce((sum, s) => sum + s.amount, 0);
}

/** Client mirror of `pricingEngineService.ts`'s `resolveOverriddenUnitPrice`, used only for the live preview. */
function resolveOverriddenUnitPrice(base: number | undefined, override: number | undefined, markupPercent: number | undefined): number | undefined {
  if (override !== undefined) return override;
  if (markupPercent !== undefined && base !== undefined) return base * (1 + markupPercent / 100);
  return base;
}

/** Narrows a `DraftItem` into a real `OrderItemPricingInput` — returns null while required fields for that kind aren't filled in yet (not an error, just "not priceable yet"). */
function buildPricingInput(d: DraftItem): OrderItemPricingInput | null {
  const extra = extraServiceFieldsOf(d);
  const margin = d.profitPercentEnabled ? { profitPercentOverride: toNum(d.profitPercentOverride) } : {};
  // Owner (2026-08-17) — manual formula overrides, "مناقصة" pricing.
  // زنك/تراج/تصميم apply to every hasPrintSection kind; ترقيم/هالك only to
  // LOOSE_PAPER/NOTEBOOK (the only two with either concept at all).
  const zpd = {
    ...(d.zincPriceOverrideEnabled ? { zincPriceOverride: toNum(d.zincPriceOverrideValue) } : {}),
    ...(d.printRunPriceOverrideEnabled ? { printRunPriceOverride: toNum(d.printRunPriceOverrideValue) } : {}),
    ...(d.designCostOverrideEnabled ? { designCostOverride: toNum(d.designCostOverrideValue) } : {}),
  };
  const numberingWaste = {
    ...(d.numberingRunPriceOverrideEnabled ? { numberingRunPriceOverride: toNum(d.numberingRunPriceOverrideValue) } : {}),
    ...(d.wasteSheetsOverrideEnabled ? { wasteSheetsOverride: toNum(d.wasteSheetsOverrideValue) } : {}),
  };
  // Owner (2026-08-17) — manual print/numbering size overrides. مقاس
  // الطباعة applies to every isSheetKind kind; مقاس الترقيم only where
  // numbering exists (LOOSE_PAPER/NOTEBOOK).
  const calcSize = d.calcSizeOverrideEnabled && d.calcSizeOverrideValue ? { calcSizeOverride: d.calcSizeOverrideValue } : {};
  const numberingSize =
    d.numberingSizeOverrideEnabled && d.numberingSizeOverrideValue ? { numberingSizeOverride: d.numberingSizeOverrideValue } : {};
  // Owner (2026-08-17) — manual notebook page-count overrides. NOTEBOOK only.
  const pageCounts = {
    ...(d.originalPagesOverrideEnabled ? { originalPagesOverride: toNum(d.originalPagesOverrideValue) } : {}),
    ...(d.copyPagesOverrideEnabled ? { copyPagesOverride: toNum(d.copyPagesOverrideValue) } : {}),
  };
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
        ...zpd,
        ...numberingWaste,
        ...calcSize,
        ...numberingSize,
      };
    case 'NOTEBOOK': {
      if (!d.sizeFamilyKey || !d.realSizeLabel || !d.inventoryItemId || !d.notebookQuantity || !d.colorCount) return null;
      const copies = d.contentType === 'ORIGINAL_PLUS_COPIES' ? toNum(d.copies) : undefined;
      // Multi-material (2026-08-17, owner: "هختار نوع الورق لكل نسخة") —
      // one independent picker per copy; an empty picker = "same paper as
      // the original", so it's simply omitted rather than sent as an
      // override (keeps the byte-identical-to-single-material guarantee).
      const materials: { role: string; inventoryItemId: string }[] = [];
      if (d.contentType === 'ORIGINAL_PLUS_COPIES') {
        for (let i = 0; i < (copies ?? 0); i++) {
          const paperId = d.copyMaterials[i];
          if (paperId) materials.push({ role: `COPY_${i + 1}`, inventoryItemId: paperId });
        }
      }
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
        copies,
        bindingPricePerNotebook: toNum(d.bindingPricePerNotebook),
        materials: materials.length ? materials : undefined,
        ...extra,
        ...margin,
        ...zpd,
        ...numberingWaste,
        ...calcSize,
        ...numberingSize,
        ...pageCounts,
      };
    }
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
        ...zpd,
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
        ...zpd,
        ...(d.wasteSheetsOverrideEnabled ? { wasteSheetsOverride: toNum(d.wasteSheetsOverrideValue) } : {}),
        ...calcSize,
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
        ...priceOverrideFieldsOf(d, 'pricePerMeterOverride', 'pricePerMeterMarkupPercent'),
      };
    case 'DIGITAL': {
      // "Yield" is only meaningful for the QUARTER machine (Yield-packed
      // pieces) — A4_DIRECT/A3_DIRECT never need it, one copy is always
      // exactly one whole sheet (owner, 2026-08-20).
      const components = d.digitalComponents
        .filter(
          (c) =>
            c.inventoryItemId &&
            c.widthCm &&
            c.heightCm &&
            c.quantity &&
            (c.printBasis !== 'QUARTER' || c.yieldPerQuarter),
        )
        .map((c, idx) => ({
          label: c.label.trim() || `المكوّن ${idx + 1}`,
          inventoryItemId: c.inventoryItemId,
          printBasis: c.printBasis,
          colorMode: c.colorMode,
          sides: c.sides,
          pieceWidthCm: toNum(c.widthCm),
          pieceHeightCm: toNum(c.heightCm),
          quantity: toNum(c.quantity),
          yieldPerQuarter: c.printBasis === 'QUARTER' ? toNum(c.yieldPerQuarter) : undefined,
          sellophaneEnabled: c.printBasis === 'QUARTER' ? c.sellophaneEnabled : false,
          boshrPricePerPiece: toOptionalNum(c.boshrPricePerPiece),
        }));
      if (components.length === 0 || components.length !== d.digitalComponents.length) return null;
      return {
        kind: 'DIGITAL',
        components,
        ...extra,
        ...margin,
      };
    }
    case 'PRODUCT':
    case 'SERVICE':
      if (!d.quantity) return null;
      return {
        kind: d.kind,
        quantity: toNum(d.quantity),
        ...extra,
        ...priceOverrideFieldsOf(d, 'unitPriceOverride', 'unitPriceMarkupPercent'),
      };
    case 'INVENTORY_RETAIL':
      if (!d.inventoryItemId || !d.quantity) return null;
      return {
        kind: 'INVENTORY_RETAIL',
        inventoryItemId: d.inventoryItemId,
        quantity: toNum(d.quantity),
        ...extra,
        ...priceOverrideFieldsOf(d, 'unitPriceOverride', 'unitPriceMarkupPercent'),
      };
    case 'MANUAL':
      if (!d.unitPrice || !d.quantity) return null;
      return { kind: 'MANUAL', unitPrice: toNum(d.unitPrice), quantity: toNum(d.quantity) };
  }
}

/**
 * Owner (2026-08-17, "عايز لما ادوس على بند في السلة بتاعت الطلبات يفتح
 * وأقدر أعدل عليه علشان لو نسيت حاجه مش امسحه وأرجع أكتبه من الأول") —
 * inverse of `buildPricingInput`. Unlike `reconstructPricingInput` below
 * (which recovers a pricing input from an already-persisted `OrderItem`'s
 * frozen `breakdown`, with no explicit `kind` for most kinds — hence
 * needing `inferStoredKind`'s guesswork), a still-in-cart `CartLine`
 * already carries its exact, fully-typed `pricing: OrderItemPricingInput`
 * — so this just walks the same fields `buildPricingInput` reads,
 * backwards, no inference needed.
 */
/** Reverse of `priceOverrideFieldsOf` — reconstructs the enabled/mode/value trio from whichever of the two stored fields is present (undefined on both = never overridden). */
function applyPriceOverrideToDraft(d: DraftItem, flatVal: number | undefined, percentVal: number | undefined): void {
  d.priceOverrideEnabled = flatVal !== undefined || percentVal !== undefined;
  d.priceOverrideMode = percentVal !== undefined ? 'PERCENT' : 'FLAT';
  d.priceOverrideValue = String((percentVal !== undefined ? percentVal : flatVal) ?? 0);
}

function draftFromCartLine(line: CartLine, extraServiceOptions: ExtraServiceOption[]): DraftItem {
  const p = line.pricing;
  const d = emptyDraftItem(p.kind, extraServiceOptions);
  d.key = line.key;
  d.itemType = line.itemType;
  d.notes = line.notes ?? '';
  d.inkColor = line.inkColor ?? '';
  d.bindingType = line.bindingType ?? '';
  d.sellophaneType = line.sellophaneType ?? '';
  d.description = line.description ?? '';
  d.readyProductId = line.readyProductId ?? '';
  d.serviceId = line.serviceId ?? '';
  d.attachmentId = line.attachmentId ?? '';
  d.attachmentUrl = line.attachmentUrl ?? '';
  d.attachmentFileName = line.attachmentUrl ? d.attachmentFileName : '';
  d.discountAmount = line.discountAmount ? String(line.discountAmount) : '0';
  d.preferredSupplierId = line.preferredSupplierId ?? '';

  // extraServiceFields's inverse — matches stored entries back to the
  // current catalog by label. A stored entry whose label no longer exists
  // in the catalog (renamed/deleted since) is kept as its own row anyway —
  // dropping it would silently lose real money off the item's total.
  const storedExtraServices = (p as Partial<{ extraServices: { label: string; amount: number }[] }>).extraServices ?? [];
  const matchedLabels = new Set<string>();
  for (const stored of storedExtraServices) {
    const row = d.extraServices.find((r) => r.label === stored.label);
    if (row) {
      row.enabled = true;
      row.amount = String(stored.amount);
      matchedLabels.add(stored.label);
    }
  }
  for (const stored of storedExtraServices) {
    if (!matchedLabels.has(stored.label)) {
      d.extraServices.push({ optionId: '', label: stored.label, enabled: true, amount: String(stored.amount) });
      matchedLabels.add(stored.label);
    }
  }

  // margin/zpd/numberingWaste's inverse — only the kinds that ever set
  // them will have a defined value here, everything else stays disabled.
  const overrides = p as Partial<{
    profitPercentOverride: number;
    zincPriceOverride: number;
    printRunPriceOverride: number;
    designCostOverride: number;
    numberingRunPriceOverride: number;
    wasteSheetsOverride: number;
  }>;
  d.profitPercentEnabled = overrides.profitPercentOverride !== undefined;
  d.profitPercentOverride = String(overrides.profitPercentOverride ?? 0);
  d.zincPriceOverrideEnabled = overrides.zincPriceOverride !== undefined;
  d.zincPriceOverrideValue = String(overrides.zincPriceOverride ?? 0);
  d.printRunPriceOverrideEnabled = overrides.printRunPriceOverride !== undefined;
  d.printRunPriceOverrideValue = String(overrides.printRunPriceOverride ?? 0);
  d.designCostOverrideEnabled = overrides.designCostOverride !== undefined;
  d.designCostOverrideValue = String(overrides.designCostOverride ?? 0);
  d.numberingRunPriceOverrideEnabled = overrides.numberingRunPriceOverride !== undefined;
  d.numberingRunPriceOverrideValue = String(overrides.numberingRunPriceOverride ?? 0);
  d.wasteSheetsOverrideEnabled = overrides.wasteSheetsOverride !== undefined;
  d.wasteSheetsOverrideValue = String(overrides.wasteSheetsOverride ?? 0);

  const sizeOverrides = p as Partial<{ calcSizeOverride: string; numberingSizeOverride: string }>;
  d.calcSizeOverrideEnabled = sizeOverrides.calcSizeOverride !== undefined;
  d.calcSizeOverrideValue = sizeOverrides.calcSizeOverride ?? '';
  d.numberingSizeOverrideEnabled = sizeOverrides.numberingSizeOverride !== undefined;
  d.numberingSizeOverrideValue = sizeOverrides.numberingSizeOverride ?? '';

  switch (p.kind) {
    case 'LOOSE_PAPER':
      d.sizeFamilyKey = p.sizeFamilyKey;
      d.realSizeLabel = p.realSizeLabel;
      d.inventoryItemId = p.inventoryItemId;
      d.colorCount = String(p.colorCount);
      d.isNewDesign = p.isNewDesign;
      d.numberingStartNumber = p.numberingStartNumber !== undefined ? String(p.numberingStartNumber) : '';
      d.quantity = String(p.quantity);
      d.sides = p.sides === 2 ? '2' : '1';
      break;
    case 'NOTEBOOK': {
      d.sizeFamilyKey = p.sizeFamilyKey;
      d.realSizeLabel = p.realSizeLabel;
      d.inventoryItemId = p.inventoryItemId;
      d.colorCount = String(p.colorCount);
      d.isNewDesign = p.isNewDesign;
      d.numberingStartNumber = p.numberingStartNumber !== undefined ? String(p.numberingStartNumber) : '';
      d.notebookQuantity = String(p.notebookQuantity);
      d.contentType = p.contentType;
      d.copies = p.copies !== undefined ? String(p.copies) : '0';
      d.bindingPricePerNotebook = String(p.bindingPricePerNotebook);
      const copyCount = p.contentType === 'ORIGINAL_PLUS_COPIES' ? (p.copies ?? 0) : 0;
      const copyMaterials = new Array(copyCount).fill('');
      for (const m of p.materials ?? []) {
        const idx = Number(m.role.replace('COPY_', '')) - 1;
        if (idx >= 0 && idx < copyMaterials.length) copyMaterials[idx] = m.inventoryItemId;
      }
      d.copyMaterials = copyMaterials;
      const notebookPageOverrides = p as Partial<{ originalPagesOverride: number; copyPagesOverride: number }>;
      d.originalPagesOverrideEnabled = notebookPageOverrides.originalPagesOverride !== undefined;
      d.originalPagesOverrideValue = String(notebookPageOverrides.originalPagesOverride ?? '');
      d.copyPagesOverrideEnabled = notebookPageOverrides.copyPagesOverride !== undefined;
      d.copyPagesOverrideValue = String(notebookPageOverrides.copyPagesOverride ?? '');
      break;
    }
    case 'ENVELOPE':
      d.quantity = String(p.quantity);
      d.colorCount = String(p.colorCount);
      d.isNewDesign = p.isNewDesign;
      d.readyEnvelopePricePerPiece = String(p.readyEnvelopePricePerPiece);
      break;
    case 'FOLDER':
      d.sizeFamilyKey = p.sizeFamilyKey;
      d.realSizeLabel = p.realSizeLabel;
      d.inventoryItemId = p.inventoryItemId;
      d.quantity = String(p.quantity);
      d.colorCount = String(p.colorCount);
      d.sides = p.sides === 2 ? '2' : '1';
      d.isNewDesign = p.isNewDesign;
      d.sellophaneEnabled = p.sellophaneEnabled;
      d.riza = p.riza !== undefined ? String(p.riza) : '';
      d.jarab = p.jarab !== undefined ? String(p.jarab) : '';
      d.forma = p.forma !== undefined ? String(p.forma) : '';
      d.taksir = p.taksir !== undefined ? String(p.taksir) : '';
      break;
    case 'BOARDS':
      d.material = p.material;
      d.widthCm = String(p.widthCm);
      d.heightCm = String(p.heightCm);
      d.hasDesign = p.hasDesign ?? false;
      d.hasSellophane = p.hasSellophane ?? false;
      applyPriceOverrideToDraft(d, p.pricePerMeterOverride, p.pricePerMeterMarkupPercent);
      break;
    case 'DIGITAL':
      d.digitalComponents = p.components.map((c) => ({
        ...emptyDigitalComponent(c.label),
        inventoryItemId: c.inventoryItemId,
        printBasis: c.printBasis,
        colorMode: c.colorMode,
        sides: c.sides,
        widthCm: String(c.pieceWidthCm),
        heightCm: String(c.pieceHeightCm),
        quantity: String(c.quantity),
        yieldPerQuarter: c.yieldPerQuarter !== undefined ? String(c.yieldPerQuarter) : '',
        sellophaneEnabled: c.sellophaneEnabled ?? false,
        boshrPricePerPiece: c.boshrPricePerPiece !== undefined ? String(c.boshrPricePerPiece) : '0',
      }));
      break;
    case 'PRODUCT':
    case 'SERVICE':
      d.quantity = String(p.quantity);
      applyPriceOverrideToDraft(d, p.unitPriceOverride, p.unitPriceMarkupPercent);
      break;
    case 'INVENTORY_RETAIL':
      d.inventoryItemId = p.inventoryItemId;
      d.quantity = String(p.quantity);
      applyPriceOverrideToDraft(d, p.unitPriceOverride, p.unitPriceMarkupPercent);
      break;
    case 'MANUAL':
      d.unitPrice = String(p.unitPrice);
      d.quantity = String(p.quantity);
      break;
  }
  return d;
}

interface PricingCtx {
  families: PricingReference['sizeFamilies'];
  pricingConstants: PricingReference['pricingConstants'];
  boardsConstants: PricingReference['boardsConstants'];
  digitalConstants: PricingReference['digitalConstants'];
  sheetPriceByInventoryItemId: Map<string, number>;
  catalogPriceById: Map<string, number>;
  salePriceByInventoryItemId: Map<string, number>;
  /** Owner (2026-08-20) — every `DigitalPriceTier`, grouped by `digitalTierTableKey` (mirrors the same grouping `pricingEngineService.ts` does server-side, so the live preview matches what submitting will actually charge). */
  digitalPriceTiersByKey: Map<string, DigitalPriceTierDto[]>;
}

/** Client-side mirror of `pricingEngineService.ts`'s `digitalTierTableKey` — must stay identical or the live preview picks the wrong tier table. */
function digitalTierTableKey(basis: DigitalPrintBasis, colorMode: DigitalColorMode, sides: DigitalSides): string {
  return `${basis}|${colorMode}|${sides}`;
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
  // NOTEBOOK only — owner (2026-08-25, "عايز لما يظهرلي سعر كل حسبة في
  // الصنف يظهرلي معاهم سعر التجليد الكلي بردو") — already computed by
  // calculateNotebookMultiMaterialCost, just wasn't surfaced in the
  // breakdown rows under the cart.
  bindingCost?: number;
  extraCosts?: number;
  subtotal?: number;
  total?: number;
  unitPrice?: number;
  // DIGITAL (§13.3)
  fitsInQuarter?: boolean;
  unitsNeeded?: number | null;
  costPerPiece?: number;
  quartersNeeded?: number;
  // BOARDS — VINYL_PRINT_CUT only (calculateBoardsCost's piece-packing
  // math already computed this server-side; just wasn't surfaced to the
  // composer before — owner: "عايز اكتب مقاس الحتة وهو يطلعلي عددها كام
  // في المتر"). No pricing-formula change, purely display.
  piecesPerMeter?: number;
  metersNeeded?: number;
  // BOARDS only — the resolved (or overridden) per-square-meter rate, for
  // showing the "الافتراضي من الإعدادات" fallback next to the manual
  // override toggle (owner, 2026-08-26: "أكتب السعر النهائي يدويًا للصنف ده").
  pricePerMeter?: number;
  // Multi-material NOTEBOOK (2026-08-17) — one entry per material actually
  // in use (just ORIGINAL when no copy overrides are set).
  materials?: { role: string; sheetsNeeded: number; sheetPrice: number; paperCost: number }[];
  // Multi-component DIGITAL (2026-08-17) — `calculateDigitalMultiComponentCost`'s
  // result has no single `costPerPiece`/`fitsInQuarter` any more (each
  // component has its own); this list replaces those single-value fields.
  components?: { label: string; fitsInQuarter: boolean; unitsNeeded: number | null; costPerPiece: number; sheetsNeeded: number }[];
}

/** Client-side mirror of `orderService.ts`'s `computeItemPricing` dispatch — same pure functions, used only for the live preview; the server always recomputes authoritatively on submit. */
function previewItemTotal(
  d: DraftItem,
  ctx: PricingCtx,
): { total: number; error: string | null; result: PricingPreviewResult | null } {
  const pricing = buildPricingInput(d);
  if (!pricing) return { total: 0, error: null, result: null };
  return pricingPreviewFromInput(pricing, d.readyProductId || d.serviceId, ctx);
}

/**
 * Same dispatch as `previewItemTotal` above, factored out to take an
 * already-normalized `OrderItemPricingInput` (+ catalog id) directly
 * instead of deriving it from a live `DraftItem` — `previewItemTotal` is
 * now a thin wrapper over this. Lets "تحميل من قالب محفوظ" (a saved
 * `OrderTemplate.itemsSnapshot`, already stored in this exact shape) reuse
 * the identical pricing-preview math without reconstructing a full
 * `DraftItem` per item kind.
 */
function pricingPreviewFromInput(
  pricing: OrderItemPricingInput,
  catalogId: string | undefined,
  ctx: PricingCtx,
): { total: number; error: string | null; result: PricingPreviewResult | null } {
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
          zincPriceOverride: pricing.zincPriceOverride,
          printRunPriceOverride: pricing.printRunPriceOverride,
          numberingRunPriceOverride: pricing.numberingRunPriceOverride,
          designCostOverride: pricing.designCostOverride,
          wasteSheetsOverride: pricing.wasteSheetsOverride,
          calcSizeOverride: pricing.calcSizeOverride,
          numberingSizeOverride: pricing.numberingSizeOverride,
        });
        return { total: r.total, error: null, result: r };
      }
      case 'NOTEBOOK': {
        const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
        if (sheetPrice === undefined) return { total: 0, error: 'الصنف المختار غير مرتبط بسعر ورق', result: null };
        // Multi-material (2026-08-17) — same orchestration the server uses,
        // for a live preview that matches what submitting will actually price.
        const materialOverrides = (pricing.materials ?? []).map((m) => {
          const overridePrice = ctx.sheetPriceByInventoryItemId.get(m.inventoryItemId);
          if (overridePrice === undefined) throw new Error('الورق المختار للصورة غير مرتبط بسعر');
          return { role: m.role, sheetPrice: overridePrice };
        });
        const r = calculateNotebookMultiMaterialCost(
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
            families,
            settings: ctx.pricingConstants,
            extraCosts,
            profitPercentOverride: pricing.profitPercentOverride,
            zincPriceOverride: pricing.zincPriceOverride,
            printRunPriceOverride: pricing.printRunPriceOverride,
            numberingRunPriceOverride: pricing.numberingRunPriceOverride,
            designCostOverride: pricing.designCostOverride,
            wasteSheetsOverride: pricing.wasteSheetsOverride,
            calcSizeOverride: pricing.calcSizeOverride,
            numberingSizeOverride: pricing.numberingSizeOverride,
            originalPagesOverride: pricing.originalPagesOverride,
            copyPagesOverride: pricing.copyPagesOverride,
          },
          materialOverrides.length ? materialOverrides : undefined,
        );
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
          zincPriceOverride: pricing.zincPriceOverride,
          printRunPriceOverride: pricing.printRunPriceOverride,
          designCostOverride: pricing.designCostOverride,
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
          zincPriceOverride: pricing.zincPriceOverride,
          printRunPriceOverride: pricing.printRunPriceOverride,
          designCostOverride: pricing.designCostOverride,
          wasteSheetsOverride: pricing.wasteSheetsOverride,
          calcSizeOverride: pricing.calcSizeOverride,
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
          pricePerMeterOverride: pricing.pricePerMeterOverride,
          pricePerMeterMarkupPercent: pricing.pricePerMeterMarkupPercent,
        });
        return { total: r.total, error: null, result: r };
      }
      case 'DIGITAL': {
        // Multi-component (2026-08-17) — each component priced fully
        // independently then summed, same orchestration the server uses.
        const componentInputs = pricing.components.map((c) => {
          const sheetPrice = ctx.sheetPriceByInventoryItemId.get(c.inventoryItemId);
          if (sheetPrice === undefined) throw new Error('أحد المكونات غير مرتبط بسعر ورق');
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
            // extraCosts/profitPercentOverride apply once at the whole-item
            // level (see `calculateDigitalMultiComponentCost`'s own doc
            // comment) — only the first component carries them here.
            extraCosts: 0,
            profitPercentOverride: pricing.profitPercentOverride,
          };
        });
        if (componentInputs[0]) componentInputs[0].extraCosts = extraCosts;
        const r = calculateDigitalMultiComponentCost(componentInputs);
        return { total: r.total, error: null, result: r };
      }
      case 'PRODUCT':
      case 'SERVICE': {
        if (!catalogId) return { total: 0, error: null, result: null };
        const unitPrice = resolveOverriddenUnitPrice(ctx.catalogPriceById.get(catalogId), pricing.unitPriceOverride, pricing.unitPriceMarkupPercent);
        if (unitPrice === undefined) return { total: 0, error: 'لا يوجد سعر لهذا الصنف', result: null };
        const total = calculateProductOrServiceCost(unitPrice, pricing.quantity, extraCosts);
        return { total, error: null, result: { unitPrice, extraCosts, total } };
      }
      case 'INVENTORY_RETAIL': {
        const unitPrice = resolveOverriddenUnitPrice(
          ctx.salePriceByInventoryItemId.get(pricing.inventoryItemId),
          pricing.unitPriceOverride,
          pricing.unitPriceMarkupPercent,
        );
        if (unitPrice === undefined) return { total: 0, error: 'هذا الصنف مالوش سعر بيع محدد', result: null };
        const total = calculateProductOrServiceCost(unitPrice, pricing.quantity, extraCosts);
        return { total, error: null, result: { unitPrice, extraCosts, total } };
      }
      case 'MANUAL': {
        const total = pricing.unitPrice * pricing.quantity;
        return { total, error: null, result: { unitPrice: pricing.unitPrice, total } };
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
      return `${d.itemType || KIND_LABELS.DIGITAL} — ${d.digitalComponents
        .map((c) => `${c.label || 'مكوّن'} ${c.widthCm}×${c.heightCm} سم × ${c.quantity}`)
        .join(' + ')}`;
    case 'PRODUCT':
      return `${readyProducts.find((p) => p.id === d.readyProductId)?.name ?? d.itemType} × ${d.quantity}`;
    case 'SERVICE':
      return `${services.find((s) => s.id === d.serviceId)?.name ?? d.itemType} × ${d.quantity}`;
    case 'INVENTORY_RETAIL':
      return `${d.itemType || KIND_LABELS.INVENTORY_RETAIL} × ${d.quantity}`;
    case 'MANUAL':
      return `${d.itemType || KIND_LABELS.MANUAL} × ${d.quantity}`;
  }
}

/**
 * Same summary text as `describeDraft`, sourced from an already-normalized
 * `OrderItemPricingInput` instead of a live `DraftItem` — every field this
 * reads (`realSizeLabel`/`quantity`/`colorCount`/etc.) already exists
 * verbatim on the pricing input itself (that's precisely what
 * `buildPricingInput` extracts a `DraftItem` down to), so this is a direct
 * read, not a re-derivation. Used only when rehydrating a saved
 * `OrderTemplate` item back into the cart.
 */
function describeFromPricingInput(
  pricing: OrderItemPricingInput,
  itemType: string,
  readyProductId: string | undefined,
  serviceId: string | undefined,
  readyProducts: ReadyProduct[],
  services: Service[],
): string {
  switch (pricing.kind) {
    case 'LOOSE_PAPER':
      return `${itemType || KIND_LABELS.LOOSE_PAPER} — ${pricing.realSizeLabel} — الكمية ${pricing.quantity} — ${pricing.colorCount} لون`;
    case 'NOTEBOOK':
      return `${itemType || KIND_LABELS.NOTEBOOK} — ${pricing.realSizeLabel} — ${pricing.notebookQuantity} دفتر`;
    case 'ENVELOPE':
      return `${itemType || KIND_LABELS.ENVELOPE} — ${pricing.quantity} قطعة`;
    case 'FOLDER':
      return `${itemType || KIND_LABELS.FOLDER} — ${pricing.realSizeLabel} — ${pricing.quantity} قطعة`;
    case 'BOARDS':
      return `${itemType || BOARD_MATERIAL_LABELS[pricing.material]} — ${pricing.widthCm}×${pricing.heightCm} سم — ${pricing.quantity} قطعة`;
    case 'DIGITAL':
      return `${itemType || KIND_LABELS.DIGITAL} — ${pricing.components
        .map((c) => `${c.label || 'مكوّن'} ${c.pieceWidthCm}×${c.pieceHeightCm} سم × ${c.quantity}`)
        .join(' + ')}`;
    case 'PRODUCT':
      return `${readyProducts.find((p) => p.id === readyProductId)?.name ?? itemType} × ${pricing.quantity}`;
    case 'SERVICE':
      return `${services.find((s) => s.id === serviceId)?.name ?? itemType} × ${pricing.quantity}`;
    case 'INVENTORY_RETAIL':
      return `${itemType || KIND_LABELS.INVENTORY_RETAIL} × ${pricing.quantity}`;
    case 'MANUAL':
      return `${itemType || KIND_LABELS.MANUAL} × ${pricing.quantity}`;
  }
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

/**
 * Owner (2026-08-17, "عايز يظهرلي تحت السلة سعر بنود الحسبة... وعدد الأفرخ من
 * كل نوع ورق وحساب الورق الكلي") — the cart list's per-line cost/material
 * breakdown, built from the same `PricingPreviewResult` already computed at
 * add-time. Purely a display reshape — no recalculation, no new pricing logic.
 */
function cartLineBreakdownRows(line: CartLine): { costRows: { label: string; value: number }[]; materials: { role: string; sheetsNeeded: number; sheetPrice: number; paperCost: number }[]; totalSheets: number | null } {
  const b = line.breakdown;
  if (!b) return { costRows: [], materials: [], totalSheets: null };

  const costRows: { label: string; value: number }[] = [];
  if (b.designCost) costRows.push({ label: 'التصميم', value: b.designCost });
  if (b.zincCost) costRows.push({ label: 'الزنكات', value: b.zincCost });
  if (b.printCost) costRows.push({ label: 'الطباعة', value: b.printCost });
  if (b.numberingCost) costRows.push({ label: 'الترقيم', value: b.numberingCost });
  if (b.paperCost) costRows.push({ label: 'الورق', value: b.paperCost });
  if (b.bindingCost) costRows.push({ label: 'التجليد', value: b.bindingCost });
  if (b.selloCost) costRows.push({ label: 'السلوفان', value: b.selloCost });
  if (b.extraCosts) costRows.push({ label: 'خدمات إضافية', value: b.extraCosts });

  const materials = b.materials ?? [];
  const totalSheets =
    materials.length > 0
      ? materials.reduce((s, m) => s + m.sheetsNeeded, 0)
      : b.components && b.components.length > 0
        ? b.components.reduce((s, c) => s + c.sheetsNeeded, 0)
        : typeof b.sheetsNeeded === 'number'
          ? b.sheetsNeeded
          : null;

  return { costRows, materials, totalSheets };
}

/** Loosely-typed shape of everything `computeItemPricing` might have merged into a frozen `breakdown` — used only when reconstructing an existing item for editing (see `reconstructPricingInput` below). */
interface StoredBreakdown {
  kind?: 'PRODUCT' | 'SERVICE' | 'INVENTORY_RETAIL' | 'MANUAL';
  quantity?: number;
  // MANUAL only — unlike PRODUCT/SERVICE/INVENTORY_RETAIL (which re-price
  // from the live catalog on edit, see reconstructPricingInput's own doc
  // comment), a manual line's price has no live source to recompute from,
  // so it's frozen and faithfully restored on edit instead.
  unitPrice?: number;
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
  // Multi-material NOTEBOOK (2026-08-17) — one entry per role actually in
  // use ('ORIGINAL' + one 'COPY_n' per copy that got its own paper), frozen
  // by `pricingEngineService.ts`'s NOTEBOOK case.
  materials?: { role: string; inventoryItemId: string; sheetsNeeded: number; sheetPrice: number; paperName: string | null }[];
  // Multi-component DIGITAL (2026-08-17) — replaces the single
  // pieceWidthCm/pieceHeightCm/yieldPerQuarter/... fields above for DIGITAL
  // specifically; `inferStoredKind` checks for this array's presence
  // instead of the old singular `fitsInQuarter` marker.
  components?: {
    label: string;
    inventoryItemId: string;
    // Added 2026-08-20 alongside printBasis/colorMode/sides — absent on
    // frozen breakdowns from before that date, defaulted in
    // `reconstructPricingInput` below.
    printBasis?: DigitalPrintBasis;
    colorMode?: DigitalColorMode;
    sides?: DigitalSides;
    pieceWidthCm: number;
    pieceHeightCm: number;
    quantity: number;
    yieldPerQuarter: number;
    sellophaneEnabled?: boolean | null;
    boshrPricePerPiece?: number | null;
  }[];
  notes?: string | null;
  /** SERVICE-kind only — "نطاق العمل", frozen into the breakdown by `orderService.ts`/`convertQuotation` (OrderItem has no dedicated column, unlike QuotationItem). */
  description?: string | null;
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
 * verbatim. The extra-service amounts collapse into one generic row —
 * their sum survives (as a single `extraServices` entry), which named
 * catalog option(s) they were originally split across doesn't.
 */
function inferStoredKind(sizeFamilyKey: string | null, breakdown: StoredBreakdown): PricingKind | null {
  if (breakdown.kind === 'PRODUCT' || breakdown.kind === 'SERVICE' || breakdown.kind === 'INVENTORY_RETAIL' || breakdown.kind === 'MANUAL')
    return breakdown.kind;
  if ('material' in breakdown) return 'BOARDS';
  // Checked before FOLDER — both freeze `sellophaneEnabled`, but only
  // DIGITAL freezes a `components` array (2026-08-17, multi-component —
  // was `'fitsInQuarter' in breakdown`, which moved inside each component).
  if (Array.isArray(breakdown.components)) return 'DIGITAL';
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
  const extra = b.extraCosts ? { extraServices: [{ label: 'خدمات إضافية', amount: b.extraCosts }] } : {};
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
    case 'NOTEBOOK': {
      if (!sizeFamilyKey || !realSizeLabel || !inventoryItemId) return null;
      // Multi-material (2026-08-17) — only the COPY_n roles become an
      // override; ORIGINAL's own material is already `inventoryItemId` above.
      const materials = (b.materials ?? [])
        .filter((m) => m.role !== 'ORIGINAL')
        .map((m) => ({ role: m.role, inventoryItemId: m.inventoryItemId }));
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
        materials: materials.length ? materials : undefined,
        ...extra,
      };
    }
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
    case 'DIGITAL': {
      // Multi-component (2026-08-17) — each component's full pricing input
      // was echoed back into `breakdown.components` by
      // `pricingEngineService.ts`, so it's read straight from there rather
      // than through the single `inventoryItemId` param (meaningless here —
      // DIGITAL items can reference several materials, one per component).
      if (!b.components?.length) return null;
      return {
        kind: 'DIGITAL',
        components: b.components.map((c) => ({
          label: c.label,
          inventoryItemId: c.inventoryItemId,
          // Frozen breakdowns from before 2026-08-20 have no printBasis/
          // colorMode/sides at all — default them to the settings that were
          // the only option back then (QUARTER/COLOR/SINGLE), matching how
          // every one of those old items was actually priced.
          printBasis: c.printBasis ?? 'QUARTER',
          colorMode: c.colorMode ?? 'COLOR',
          sides: c.sides ?? 'SINGLE',
          pieceWidthCm: c.pieceWidthCm,
          pieceHeightCm: c.pieceHeightCm,
          quantity: c.quantity,
          yieldPerQuarter: c.yieldPerQuarter,
          sellophaneEnabled: c.sellophaneEnabled ?? false,
          boshrPricePerPiece: c.boshrPricePerPiece ?? undefined,
        })),
        ...extra,
      };
    }
    case 'PRODUCT':
    case 'SERVICE':
      return { kind, quantity: b.quantity ?? 1, ...extra };
    case 'INVENTORY_RETAIL':
      if (!inventoryItemId) return null;
      return { kind: 'INVENTORY_RETAIL', inventoryItemId, quantity: b.quantity ?? 1, ...extra };
    case 'MANUAL':
      return { kind: 'MANUAL', unitPrice: b.unitPrice ?? 0, quantity: b.quantity ?? 1 };
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
  item: { id: string; kind: string | null; modelName: string | null; breakdown?: unknown; itemTotal: number | null; sizeFamilyKey: string | null; realSizeLabel: string | null; inventoryItemId?: string | null; readyProductId?: string | null; serviceId?: string | null; productionTrack?: ProductionTrack | null; groupId?: string | null },
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
      description: b.description ?? undefined,
      inkColor: b.inkColor ?? undefined,
      bindingType: b.bindingType ?? undefined,
      sellophaneType: b.sellophaneType ?? undefined,
      readyProductId,
      serviceId,
      attachmentUrl: b.referenceImageUrl ?? undefined,
      pricing,
      total: item.itemTotal ?? 0,
      productionTrack: item.productionTrack ?? null,
      // "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — reusing the real
      // `groupId` as the reconstructed line's `groupKey` is enough: two
      // lines that shared a group before still share this same string now,
      // which is all `resolveOrderItemGroups`/`resolveQuotationItemGroups`
      // need to re-link them into a fresh group row on save.
      groupKey: item.groupId ?? undefined,
    },
    warning: null,
  };
}

/**
 * "بعد ما الاوردر يتحفظ يسألني هل احفظه كقالب دوري" (owner, 2026-08-17) —
 * loads one item from a saved `OrderTemplate.itemsSnapshot` back into an
 * editable `CartLine`, pricing recomputed fresh via `pricingPreviewFromInput`
 * (never the stored total, if one had been stored — it wasn't). Simpler
 * than `reconstructCartLine` above: a template stores the exact
 * `CreateOrderItemInput` shape (including the real `pricing` input) rather
 * than a frozen `breakdown` a shape has to be inferred back out of, so no
 * kind-detection/inference step is needed. `newGroupKey` is pre-resolved by
 * the caller (one fresh key per distinct original `groupKey` in the
 * template, so items that were grouped together stay grouped together,
 * without colliding with any group already in the current cart) — the
 * attachment fields are deliberately dropped (a template isn't tied to any
 * one job's reference image).
 */
function buildCartLineFromTemplateItem(
  item: CreateOrderItemInput,
  ctx: PricingCtx,
  readyProducts: ReadyProduct[],
  services: Service[],
  newGroupKey: string | undefined,
): { line: CartLine | null; warning: string | null } {
  const catalogId = item.readyProductId || item.serviceId;
  const preview = pricingPreviewFromInput(item.pricing, catalogId, ctx);
  if (preview.error) {
    return { line: null, warning: `"${item.itemType}": ${preview.error}` };
  }
  draftKeySeq += 1;
  return {
    line: {
      key: `item-${draftKeySeq}`,
      itemType: item.itemType,
      summary: describeFromPricingInput(item.pricing, item.itemType, item.readyProductId, item.serviceId, readyProducts, services),
      notes: item.notes,
      description: item.description,
      inkColor: item.inkColor,
      bindingType: item.bindingType,
      sellophaneType: item.sellophaneType,
      readyProductId: item.readyProductId,
      serviceId: item.serviceId,
      pricing: item.pricing,
      total: preview.total,
      productionTrack: item.productionTrack ?? null,
      breakdown: preview.result ?? undefined,
      groupKey: newGroupKey,
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
type CreatedResult =
  | { type: 'INVOICE'; order: Order; itemsSnapshot: CreateOrderItemInput[] }
  | { type: 'QUOTATION'; quotation: Quotation; itemsSnapshot: CreateOrderItemInput[] };

export function NewOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editOrderId = searchParams.get('editOrder');
  const editQuotationId = searchParams.get('editQuotation');
  // FEATURE-016 (2026-08-16) — the Documents page's per-customer "+ إضافة"
  // link lands here with the customer pre-selected, same query-param
  // pattern as editOrder/editQuotation above.
  const presetPartnerId = searchParams.get('partnerId') ?? undefined;
  // Owner (2026-08-20, "زرار 'اعمله عرض سعر' من شاشة الـLead") — a
  // freshly-converted Lead lands here to build a Quotation specifically,
  // not default to whatever `canInvoice` would otherwise pick.
  const presetDocumentType = searchParams.get('documentType') === 'QUOTATION' ? 'QUOTATION' : undefined;
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [readyProducts, setReadyProducts] = useState<ReadyProduct[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [pricingReference, setPricingReference] = useState<PricingReference | null>(null);
  const [extraServiceOptions, setExtraServiceOptions] = useState<ExtraServiceOption[]>([]);
  const [treasuryCategories, setTreasuryCategories] = useState<TreasuryCategory[]>([]);
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
      apiGet<ExtraServiceOption[]>('/api/extra-service-options').catch(() => []),
      apiGet<TreasuryCategory[]>('/api/treasury-categories').catch(() => []),
      editOrderId ? apiGet<Order>(`/api/orders/${editOrderId}`) : Promise.resolve(null),
      editQuotationId ? apiGet<Quotation>(`/api/quotations/${editQuotationId}`) : Promise.resolve(null),
    ])
      .then(([p, b, rp, s, inv, pricing, extraServices, categories, order, quotation]) => {
        setPartners(p);
        setBranches(b);
        setReadyProducts(rp);
        setServices(s);
        setInventoryItems(inv);
        setPricingReference(pricing);
        setExtraServiceOptions(extraServices.filter((o) => o.isActive));
        setTreasuryCategories(categories.filter((c) => c.isActive));
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
        {/* "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — an order can now
            auto-create several Work Orders, one per distinct track present
            among its items (see orderService.createOrder) — one print
            button per Work Order, plus the manual panel below for any
            track still missing one (no published template yet). */}
        {order.workOrders.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {order.workOrders.map((wo) => (
              <Button key={wo.id} type="button" variant="secondary" onClick={() => navigate(`/work-orders/${wo.id}`)}>
                طباعة أمر شغل {PRODUCTION_TRACK_LABELS[wo.productionTrack]}
              </Button>
            ))}
          </div>
        )}
        <GenerateWorkOrderPanel order={order} />
        <SaveAsTemplateSection itemsSnapshot={created.itemsSnapshot} branchId={order.branchId} partnerId={order.partnerId} />
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
        <SaveAsTemplateSection itemsSnapshot={created.itemsSnapshot} branchId={quotation.branchId} partnerId={quotation.partnerId} />
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
      extraServiceOptions={extraServiceOptions}
      treasuryCategories={treasuryCategories}
      onCreated={setCreated}
      editOrder={editOrder}
      editQuotation={editQuotation}
      presetPartnerId={presetPartnerId}
      presetDocumentType={presetDocumentType}
    />
  );
}

/**
 * Owner (2026-08-17, "بعد ما الاوردر يتحفظ يسألني هل احفظه كقالب دوري") —
 * the exact prompt requested: right after a save succeeds, ask whether to
 * keep this item configuration as a reusable template, two-step (yes/no
 * first, name only once "yes" is picked) so the common "no" case stays a
 * single click. `itemsSnapshot` is the literal `outputItems` array that
 * was just POSTed — already `CreateOrderItemInput[]`, no reconstruction
 * needed on the way in (see `buildCartLineFromTemplateItem` for the way out).
 */
function SaveAsTemplateSection({
  itemsSnapshot,
  branchId,
  partnerId,
}: {
  itemsSnapshot: CreateOrderItemInput[];
  branchId: string;
  partnerId: string | null;
}) {
  const [step, setStep] = useState<'ASK' | 'NAME' | 'SAVED'>('ASK');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const input: CreateOrderTemplateInput = { name: name.trim(), branchId, partnerId: partnerId ?? undefined, itemsSnapshot };
      await apiPost('/api/order-templates', input);
      setStep('SAVED');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ القالب');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'SAVED') {
    return <p className="text-success border-border border-t pt-3 text-sm">✓ اتحفظ القالب — هيظهر في "تحميل من قالب محفوظ" في أي طلب جديد.</p>;
  }

  return (
    <div className="border-border space-y-2 border-t pt-3">
      {step === 'ASK' ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm">تحب تحفظ الطلب ده كقالب متكرر؟</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setStep('NAME')}>
            أيوه
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep('SAVED')}>
            لأ
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم القالب، مثال: دفاتر مدرسة النور الشهرية"
            className="border-input bg-background min-w-[220px] rounded-md border px-3 py-2 text-sm"
          />
          <Button type="button" size="sm" disabled={!name.trim() || saving} onClick={() => void save()}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ القالب'}
          </Button>
        </div>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
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
/**
 * "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — was a single dropdown +
 * "إنشاء" button for the whole order; now one row per track that has
 * items resolving to it but no linked Work Order yet (its template wasn't
 * published at save time — `READY_PRODUCTS` is the current example).
 * Renders nothing at all once every resolvable track has a Work Order.
 */
function GenerateWorkOrderPanel({ order }: { order: Order }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [createdByTrack, setCreatedByTrack] = useState<Partial<Record<ProductionTrack, WorkOrder>>>({});
  const [errorByTrack, setErrorByTrack] = useState<Partial<Record<ProductionTrack, string>>>({});
  const [submittingTrack, setSubmittingTrack] = useState<ProductionTrack | null>(null);

  useEffect(() => {
    if (!can('work-orders.edit')) return;
    apiGet<WorkflowTemplate[]>('/api/workflow-templates')
      .then((all) => {
        // Latest *published* version per code — `createWorkOrder` resolves
        // `templateCode` to `getLatestPublishedTemplate`, so a draft-only
        // code (never published) or an older published version doesn't
        // count as "has a template" here.
        const latestPublishedByCode = new Map<string, WorkflowTemplate>();
        for (const t of all) {
          if (!t.publishedAt) continue;
          const existing = latestPublishedByCode.get(t.code);
          if (!existing || t.version > existing.version) latestPublishedByCode.set(t.code, t);
        }
        setTemplates([...latestPublishedByCode.values()]);
      })
      .catch(() => setTemplates([]));
  }, [can]);

  if (!can('work-orders.edit')) return null;

  const linkedTracks = new Set(order.workOrders.map((w) => w.productionTrack));
  const missingTracks = [
    ...new Set(
      order.items
        .map((i) => i.productionTrack)
        .filter((t): t is ProductionTrack => Boolean(t) && !linkedTracks.has(t as ProductionTrack)),
    ),
  ];
  if (missingTracks.length === 0) return null;

  const generate = async (track: ProductionTrack) => {
    setSubmittingTrack(track);
    setErrorByTrack((prev) => ({ ...prev, [track]: undefined }));
    try {
      const workOrder = await apiPost<WorkOrder>('/api/work-orders', { orderId: order.id, templateCode: track });
      setCreatedByTrack((prev) => ({ ...prev, [track]: workOrder }));
    } catch (err) {
      setErrorByTrack((prev) => ({ ...prev, [track]: err instanceof Error ? err.message : 'تعذر إنشاء أمر الشغل' }));
    } finally {
      setSubmittingTrack(null);
    }
  };

  return (
    <div className="space-y-2">
      {missingTracks.map((track) => {
        const created = createdByTrack[track];
        if (created) {
          return (
            <div key={track} className="border-border bg-muted/30 space-y-2 rounded-xl border p-3 text-sm">
              <p className="font-medium">تم إنشاء أمر شغل {PRODUCTION_TRACK_LABELS[track]}</p>
              <p className="text-muted-foreground">{created.workOrderNumber}</p>
              <Button type="button" size="sm" onClick={() => navigate(`/work-orders/${created.id}`)}>
                طباعة 🖶
              </Button>
            </div>
          );
        }
        const hasTemplate = templates?.some((t) => t.code === track);
        return (
          <div key={track} className="border-border space-y-2 rounded-xl border border-dashed p-3 text-start">
            {templates === null ? (
              <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
            ) : !hasTemplate ? (
              <p className="text-muted-foreground text-sm">
                لا يوجد قالب منشور لمسار "{PRODUCTION_TRACK_LABELS[track]}" بعد — لازم يتم إعداده أولاً من إعدادات النظام.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">أصناف {PRODUCTION_TRACK_LABELS[track]} محتاجة أمر شغل</span>
                <Button type="button" size="sm" disabled={submittingTrack === track} onClick={() => void generate(track)}>
                  {submittingTrack === track ? 'جارٍ الإنشاء…' : 'إنشاء أمر شغل'}
                </Button>
              </div>
            )}
            {errorByTrack[track] && <p className="text-destructive text-sm">{errorByTrack[track]}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** One already-added line in the "بنود الفاتورة" cart — frozen at add-time, same shape the server will re-price on submit. */
interface CartLine {
  key: string;
  itemType: string;
  summary: string;
  notes?: string;
  /** SERVICE-kind only — "نطاق العمل" (scope of work), distinct from the generic printed `notes`. Reuses the schema's existing top-level `description` field (see createOrderItemSchema), never surfaced in the UI until now. */
  description?: string;
  inkColor?: string;
  bindingType?: string;
  sellophaneType?: string;
  readyProductId?: string;
  serviceId?: string;
  attachmentId?: string;
  attachmentUrl?: string;
  pricing: OrderItemPricingInput;
  total: number;
  /** "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — stamped from the composer tab at add-time (see `addToCart`), never manually picked. Null = this item never enters production (INVENTORY_RETAIL). */
  productionTrack: ProductionTrack | null;
  /** Owner (2026-08-17, "عايز يظهرلي تحت السلة سعر بنود الحسبة... وعدد الأفرخ من كل نوع ورق") — the full pricing-engine result captured at add-time, rendered as a line-item cost/material breakdown under the cart. Frozen the same way `total` already is (never recomputed just for display); undefined for kinds with nothing to break down (PRODUCT/SERVICE/INVENTORY_RETAIL). */
  breakdown?: PricingPreviewResult;
  /**
   * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — a client-side
   * correlation key shared by two or more lines built from "كرر بمقاس/كمية
   * مختلفة" (see `duplicateLineAsVariant`). Sent through as `groupKey` on
   * save; the server links same-keyed items to one real `OrderItemGroup`
   * row. Undefined = this line isn't part of any group, exactly like today.
   */
  groupKey?: string;
  /** Owner (2026-08-23, "تخفيض على صنف محدد وليس بالضرورة كل الفاتورة") — an absolute discount on this line alone, stacking with the order-level discountPercent. */
  discountAmount?: number;
  /** Owner (2026-08-23, "اكتب اسم المورد منين وانا بطلب؟") — READY_PRODUCTS only. */
  preferredSupplierId?: string;
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

/** "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — see `duplicateLineAsVariant`. */
let groupKeySeq = 0;

function NewOrderForm({
  partners,
  branches,
  readyProducts,
  services,
  inventoryItems,
  pricingReference,
  extraServiceOptions,
  treasuryCategories,
  onCreated,
  editOrder,
  editQuotation,
  presetPartnerId,
  presetDocumentType,
}: {
  partners: BusinessPartner[];
  branches: BranchSummary[];
  readyProducts: ReadyProduct[];
  services: Service[];
  inventoryItems: InventoryItem[];
  pricingReference: PricingReference;
  extraServiceOptions: ExtraServiceOption[];
  treasuryCategories: TreasuryCategory[];
  onCreated: (result: CreatedResult) => void;
  /** FEATURE-007 — full item-replacement edit (owner, 2026-08-12: "استبدال كامل للأصناف"). Present only when reached via `/orders/new?editOrder=<id>`. */
  editOrder?: Order | null;
  /** FEATURE-007 (2026-08-12, owner: "المفروض أقدر أعدل في عرض السعر إني أضيف مثلا بند") — same full item-replacement edit, for a Quotation. Present only when reached via `/orders/new?editQuotation=<id>`. Mutually exclusive with `editOrder` — never both set. */
  editQuotation?: Quotation | null;
  /** FEATURE-016 — pre-selects the customer when reached from a Documents group's "+ إضافة" link (`/orders/new?partnerId=<id>`). Ignored once editOrder/editQuotation already fix the customer. */
  presetPartnerId?: string;
  /** Owner (2026-08-20, "زرار 'اعمله عرض سعر' من شاشة الـLead") — forces the composer to open on the Quotation tab (`/orders/new?documentType=QUOTATION`), not whatever `canInvoice` would otherwise default to. Ignored once editOrder/editQuotation already fix the document type. */
  presetDocumentType?: 'QUOTATION';
}) {
  const { can } = useAuth();
  const canInvoice = can('orders.create');
  const canQuotation = can('quotations.create');
  const isEditing = Boolean(editOrder) || Boolean(editQuotation);
  const [documentType, setDocumentType] = useState<DocumentType>(
    editOrder ? 'INVOICE' : editQuotation ? 'QUOTATION' : (presetDocumentType ?? (canInvoice ? 'INVOICE' : 'QUOTATION')),
  );
  // نسخة محلية قابلة للتحديث — عشان لما تتضاف عميل جديد من نفس الشاشة يظهر فورًا بدون إعادة تحميل الصفحة.
  const [localPartners, setLocalPartners] = useState<BusinessPartner[]>(partners);
  const [showAddPartner, setShowAddPartner] = useState(false);
  /** Owner (2026-08-20, "بيع سريع... جوة تاب بضاعة من المخزون وتاب بند يدوي") — see QuickSaleDialog/QuickManualIncomeDialog below. */
  const [showQuickSale, setShowQuickSale] = useState(false);
  const [showQuickIncome, setShowQuickIncome] = useState(false);
  const [partnerId, setPartnerId] = useState(
    editOrder?.partnerId ?? editQuotation?.partnerId ?? presetPartnerId ?? partners[0]?.id ?? '',
  );
  /** Owner (2026-08-20, "فاتورة بدون إسم العميل") — see `WALK_IN_ALLOWED_KINDS`. */
  const [walkIn, setWalkIn] = useState(
    Boolean((editOrder && !editOrder.partnerId) || (editQuotation && !editQuotation.partnerId)),
  );
  const [branchId, setBranchId] = useState(editOrder?.branchId ?? editQuotation?.branchId ?? branches[0]?.id ?? '');
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16, owner: "الغيها خالص —
  // النظام يحدد لوحده") — supersedes the old single order-level
  // productionTrack dropdown + one global requiresDesign toggle. Each cart
  // item now stamps its own track automatically (see `addToCart`); this
  // state is just "needs design?" per resolved track present in the cart,
  // defaulting to `true` (unchanged behavior) for any track not explicitly
  // toggled off — see the dynamic toggle group in the JSX below.
  const [requiresDesignByTrack, setRequiresDesignByTrack] = useState<Partial<Record<ProductionTrack, boolean>>>({});
  const [deliveryDate, setDeliveryDate] = useState(editOrder?.deliveryDate?.slice(0, 10) ?? '');
  const [paymentTerms, setPaymentTerms] = useState(editOrder?.paymentTerms ?? '');
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
  const [draft, setDraft] = useState<DraftItem>(() => emptyDraftItem('LOOSE_PAPER', extraServiceOptions));
  const [itemError, setItemError] = useState<string | null>(null);
  /** MANUAL kind's اسم البند picker — starts in "select from التصنيفات" mode, "تصنيف آخر" switches to free-text. */
  const [manualCategoryCustom, setManualCategoryCustom] = useState(false);
  /** Owner (2026-08-17, "عايز لما ادوس على بند في السلة... أقدر أعدل عليه") — the `CartLine.key` currently loaded into the composer for editing, or null when composing a brand-new item. `addToCart` checks this to decide "update in place" vs "append". */
  const [editingKey, setEditingKey] = useState<string | null>(null);
  /** "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — set by `duplicateLineAsVariant`, read once by the next `addToCart` to link the new line to its source line's group, then cleared. */
  const [pendingGroupKey, setPendingGroupKey] = useState<string | null>(null);

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
  const trackedFields = { cart, payments, partnerId, walkIn, branchId, requiresDesignByTrack, deliveryDate, paymentTerms, discountPercent, vatOn, customerNotes, internalNotes };
  const initialSnapshot = useRef<string | undefined>(undefined);
  if (initialSnapshot.current === undefined) {
    initialSnapshot.current = JSON.stringify(trackedFields);
  }
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  useEffect(() => {
    setHasUnsavedChanges(JSON.stringify(trackedFields) !== initialSnapshot.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, payments, partnerId, walkIn, branchId, requiresDesignByTrack, deliveryDate, paymentTerms, discountPercent, vatOn, customerNotes, internalNotes]);

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
      salePriceByInventoryItemId: new Map(
        inventoryItems.filter((i) => i.salePrice !== null).map((i) => [i.id, i.salePrice as number]),
      ),
      digitalPriceTiersByKey: pricingReference.digitalPriceTiers.reduce((map, tier) => {
        const key = digitalTierTableKey(tier.basis, tier.colorMode, tier.sides);
        const list = map.get(key);
        if (list) list.push(tier);
        else map.set(key, [tier]);
        return map;
      }, new Map<string, DigitalPriceTierDto[]>()),
    }),
    [pricingReference, inventoryItems, readyProducts, services],
  );

  // "بعد ما الاوردر يتحفظ يسألني هل احفظه كقالب دوري" (owner, 2026-08-17)
  // — the other half of that ask: picking a saved template back up to
  // prefill a brand-new order/quotation composer.
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<OrderTemplate[]>([]);
  useEffect(() => {
    apiGet<OrderTemplate[]>('/api/order-templates')
      .then(setTemplates)
      .catch(() => undefined);
  }, []);
  const [templateLoadWarnings, setTemplateLoadWarnings] = useState<string[]>([]);

  const loadTemplate = async (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    if (
      cart.length > 0 &&
      !(await confirm({
        title: `استبدال بنود السلة الحالية بقالب "${template.name}"؟`,
        description: 'أي بنود مضافة دلوقتي هتتشال.',
      }))
    ) {
      return;
    }
    // Two items sharing the template's original `groupKey` should still
    // land in the same group after loading — just under a freshly minted
    // key, so it can never collide with a group already in an unrelated cart.
    const groupKeyMap = new Map<string, string>();
    const results = template.itemsSnapshot.map((item) => {
      let newGroupKey: string | undefined;
      if (item.groupKey) {
        if (!groupKeyMap.has(item.groupKey)) {
          draftKeySeq += 1;
          groupKeyMap.set(item.groupKey, `group-${draftKeySeq}`);
        }
        newGroupKey = groupKeyMap.get(item.groupKey);
      }
      return buildCartLineFromTemplateItem(item, ctx, readyProducts, services, newGroupKey);
    });
    setCart(results.map((r) => r.line).filter((l): l is CartLine => l !== null));
    setTemplateLoadWarnings(results.map((r) => r.warning).filter((w): w is string => w !== null));
  };

  const draftPreview = useMemo(() => previewItemTotal(draft, ctx), [draft, ctx]);
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — the resolved tracks
  // actually present in the cart right now, used to render one "يحتاج
  // تصميم؟" toggle per track instead of the old single global one.
  const tracksInCart = [...new Set(cart.map((l) => l.productionTrack).filter((t): t is ProductionTrack => Boolean(t)))];
  const subtotal = cart.reduce((sum, line) => sum + line.total, 0);
  const itemDiscountsTotal = cart.reduce((sum, line) => sum + (line.discountAmount ?? 0), 0);
  const discountNum = toNum(discountPercent);
  const afterDiscount = (subtotal - itemDiscountsTotal) * (1 - discountNum / 100);
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
    if (kind) setDraft(emptyDraftItem(kind, extraServiceOptions));
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
    const discountAmount = toNum(draft.discountAmount) || 0;
    if (discountAmount < 0 || discountAmount > preview.total) {
      setItemError(`الخصم لازم يكون بين 0 و${money(preview.total)} ج.م`);
      return;
    }
    setItemError(null);
    const label = draft.itemType || KIND_LABELS[draft.kind];
    const line: CartLine = {
      key: draft.key,
      itemType: label,
      summary: describeDraft(draft, readyProducts, services),
      notes: draft.notes || undefined,
      description: draft.kind === 'SERVICE' ? draft.description || undefined : undefined,
      inkColor: draft.inkColor || undefined,
      bindingType: draft.bindingType || undefined,
      sellophaneType: draft.sellophaneType || undefined,
      readyProductId: draft.kind === 'PRODUCT' ? draft.readyProductId || undefined : undefined,
      serviceId: draft.kind === 'SERVICE' ? draft.serviceId || undefined : undefined,
      attachmentId: draft.attachmentId || undefined,
      attachmentUrl: draft.attachmentUrl || undefined,
      pricing,
      total: preview.total,
      productionTrack: resolveProductionTrackForTab(activeParentId),
      breakdown: preview.result ?? undefined,
      // "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — a brand-new line
      // from "كرر بمقاس مختلف" carries `pendingGroupKey`; a normal edit of
      // an already-grouped line keeps whatever group it already had.
      groupKey: pendingGroupKey ?? (editingKey ? cart.find((l) => l.key === editingKey)?.groupKey : undefined),
      discountAmount: discountAmount || undefined,
      preferredSupplierId: draft.kind === 'PRODUCT' ? draft.preferredSupplierId || undefined : undefined,
    };
    if (editingKey) {
      setCart((prev) => prev.map((l) => (l.key === editingKey ? line : l)));
      setEditingKey(null);
    } else {
      setCart((prev) => [...prev, line]);
    }
    setPendingGroupKey(null);
    setDraft(emptyDraftItem(activeParent.kind ?? activeSubTab?.kind ?? 'LOOSE_PAPER', extraServiceOptions));
  };

  const removeFromCart = (key: string) => {
    setCart((prev) => prev.filter((line) => line.key !== key));
    // The line being edited was just deleted out from under the composer — drop back to a fresh item instead of "saving" would silently resurrect it.
    if (editingKey === key) {
      setEditingKey(null);
      setPendingGroupKey(null);
      setDraft(emptyDraftItem(activeParent.kind ?? activeSubTab?.kind ?? 'LOOSE_PAPER', extraServiceOptions));
    }
  };

  /** Owner (2026-08-17) — clicking a cart line re-opens it in the composer, pre-filled, instead of only delete-and-re-add. */
  const openLineForEdit = (line: CartLine) => {
    const serviceCategory = line.serviceId ? services.find((s) => s.id === line.serviceId)?.category : undefined;
    const category = findCategoryForKind(line.pricing.kind, serviceCategory, line.productionTrack);
    setActiveParentId(category.parentId);
    setActiveSubTabId(category.subTabId);
    setDraft(draftFromCartLine(line, extraServiceOptions));
    setEditingKey(line.key);
    setPendingGroupKey(null);
    setItemError(null);
  };

  /**
   * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19, owner: "عايز أقدر أعمل
   * طلب فيه تصميم واحد بمقاسات/كميات مختلفة من غير ما أكرر كل حاجة") —
   * opens the composer pre-filled from an existing line (same as
   * `openLineForEdit`), but as a brand-new line, not an edit — saving it
   * adds a second cart line instead of replacing the source. The source
   * line gets a fresh `groupKey` right away if it didn't have one yet (a
   * "group" only exists once two lines actually share a key).
   */
  const duplicateLineAsVariant = (line: CartLine) => {
    let groupKey = line.groupKey;
    if (!groupKey) {
      groupKeySeq += 1;
      groupKey = `group-${groupKeySeq}`;
      setCart((prev) => prev.map((l) => (l.key === line.key ? { ...l, groupKey } : l)));
    }
    const serviceCategory = line.serviceId ? services.find((s) => s.id === line.serviceId)?.category : undefined;
    const category = findCategoryForKind(line.pricing.kind, serviceCategory, line.productionTrack);
    setActiveParentId(category.parentId);
    setActiveSubTabId(category.subTabId);
    setDraft(draftFromCartLine(line, extraServiceOptions));
    setEditingKey(null);
    setPendingGroupKey(groupKey);
    setItemError(null);
  };

  const cancelEditingLine = () => {
    setEditingKey(null);
    setPendingGroupKey(null);
    setDraft(emptyDraftItem(activeParent.kind ?? activeSubTab?.kind ?? 'LOOSE_PAPER', extraServiceOptions));
    setItemError(null);
  };

  // system_specifications_v2.md (2026-08-16, "بضاعة من المخزون") — a HID
  // barcode scanner types the code then Enter, exactly like a very fast
  // keyboard. Scanning goes straight into the cart (increment quantity if
  // the item's already there), skipping the usual "أضف للفاتورة" click —
  // that's the actual speed a physical POS scan is for.
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  const scanBarcode = async () => {
    const code = barcodeInput.trim();
    if (!code || barcodeLoading) return;
    setBarcodeLoading(true);
    setBarcodeError(null);
    try {
      const item = await apiGet<InventoryItem>(`/api/inventory-items/by-barcode/${encodeURIComponent(code)}`);
      if (item.salePrice === null) {
        setBarcodeError(`"${item.name}" مسجل بس مالوش سعر بيع — حدده الأول من شاشة المخزون`);
        return;
      }
      const salePrice = item.salePrice;
      setCart((prev) => {
        const idx = prev.findIndex((l) => l.pricing.kind === 'INVENTORY_RETAIL' && l.pricing.inventoryItemId === item.id);
        if (idx >= 0) {
          const existing = prev[idx]!;
          const pricing = existing.pricing as Extract<OrderItemPricingInput, { kind: 'INVENTORY_RETAIL' }>;
          const quantity = pricing.quantity + 1;
          const total = calculateProductOrServiceCost(salePrice, quantity, sumExtraCosts(pricing));
          const updated: CartLine = { ...existing, pricing: { ...pricing, quantity }, summary: `${item.name} × ${quantity}`, total };
          return prev.map((l, i) => (i === idx ? updated : l));
        }
        const pricing: OrderItemPricingInput = { kind: 'INVENTORY_RETAIL', inventoryItemId: item.id, quantity: 1 };
        const newLine: CartLine = {
          key: `scan-${item.id}`,
          itemType: item.name,
          summary: `${item.name} × 1`,
          pricing,
          total: calculateProductOrServiceCost(salePrice, 1, 0),
          productionTrack: null,
        };
        return [...prev, newLine];
      });
      setBarcodeInput('');
    } catch (err) {
      setBarcodeError(err instanceof Error ? err.message : 'مفيش صنف بهذا الباركود');
    } finally {
      setBarcodeLoading(false);
    }
  };

  const addPaymentRow = () => setPayments((prev) => [...prev, emptyPaymentRow()]);
  const updatePaymentRow = (key: string, patch: Partial<PaymentRow>) =>
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const removePaymentRow = (key: string) => setPayments((prev) => prev.filter((p) => p.key !== key));

  const submit = async (intent: 'SAVE_ONLY' | 'SAVE_AND_PRINT') => {
    if (submitting) return;
    setError(null);

    if (cart.length === 0) {
      setError('أضف بندًا واحدًا على الأقل للفاتورة قبل الحفظ');
      return;
    }

    // FEATURE-016 — the customer field is no longer a native `<select
    // required>` (now `PartnerCombobox`, a button/search combo with no
    // built-in HTML5 form validation), so this replaces that lost gate.
    // Owner (2026-08-20, "فاتورة بدون إسم العميل") — skipped entirely for a
    // walk-in/cash sale, but only when every item qualifies.
    if (walkIn) {
      if (cart.some((line) => !WALK_IN_ALLOWED_KINDS.has(line.pricing.kind))) {
        setError('فاتورة بدون عميل متاحة بس لو كل البنود "بضاعة من المخزون" أو "بند يدوي"');
        return;
      }
    } else if (!partnerId) {
      setError('اختر العميل أولًا');
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
      // a second, redundant free-text field to the form. SERVICE items
      // prefer the staff's own "نطاق العمل" text when they entered one.
      description: line.description ?? (line.readyProductId || line.serviceId ? undefined : line.itemType),
      readyProductId: line.readyProductId,
      serviceId: line.serviceId,
      attachmentId: line.attachmentId,
      pricing: line.pricing,
      productionTrack: line.productionTrack,
      groupKey: line.groupKey,
      discountAmount: line.discountAmount,
      preferredSupplierId: line.preferredSupplierId,
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
          partnerId: walkIn ? undefined : partnerId,
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
          onCreated({ type: 'QUOTATION', quotation, itemsSnapshot: outputItems });
        }
      } else if (isEditing && editOrder) {
        const input: UpdateOrderInput = {
          discountPercent: discountNum,
          vatOn,
          deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : null,
          paymentTerms: paymentTerms || null,
          customerNotes: customerNotes || null,
          internalNotes: internalNotes || null,
          requiresDesignByTrack,
          items: outputItems,
        };
        const order = await apiPut<Order>(`/api/orders/${editOrder.id}`, input);
        navigate(`/orders/${order.id}`);
      } else {
        const paymentInputs: CreatePaymentInput[] = payments
          .filter((p) => toOptionalNum(p.amount) && toNum(p.amount) > 0)
          .map((p) => ({ method: p.method, amount: toNum(p.amount) }));
        const input: CreateOrderInput = {
          partnerId: walkIn ? undefined : partnerId,
          branchId,
          discountPercent: discountNum,
          vatOn,
          deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : undefined,
          paymentTerms: paymentTerms || undefined,
          customerNotes: customerNotes || undefined,
          internalNotes: internalNotes || undefined,
          requiresDesignByTrack,
          items: outputItems,
          payments: paymentInputs.length ? paymentInputs : undefined,
        };
        const order = await apiPost<Order>('/api/orders', input);
        if (intent === 'SAVE_AND_PRINT') {
          navigate(`/orders/${order.id}`);
        } else {
          onCreated({ type: 'INVOICE', order, itemsSnapshot: outputItems });
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
  /**
   * Owner (2026-08-26, "أكتب السعر النهائي يدويًا للصنف ده") — the 4 kinds
   * that had no manual price-override concept at all until now (they never
   * apply a profit-margin multiplier the way LOOSE_PAPER/NOTEBOOK/etc. do).
   */
  const hasUnitPriceOverrideSection =
    draft.kind === 'BOARDS' || draft.kind === 'PRODUCT' || draft.kind === 'SERVICE' || draft.kind === 'INVENTORY_RETAIL';

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      {/* عمود شمال — السلة (بنود الفاتورة/العرض)، زي الفيديو بالظبط */}
      <aside className="border-border bg-card sticky top-4 order-2 h-fit space-y-3 rounded-2xl border p-4">
        <p className="flex items-center gap-1 text-sm font-bold">🛒 {documentType === 'QUOTATION' ? 'بنود عرض السعر' : 'بنود الفاتورة'}</p>

        {templates.length > 0 && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">تحميل من قالب محفوظ (اختياري)</span>
            <select
              value=""
              onChange={(e) => e.target.value && void loadTemplate(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">— اختر قالب —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.itemsSnapshot.length} بند)
                </option>
              ))}
            </select>
          </label>
        )}
        {templateLoadWarnings.length > 0 && (
          <div className="border-warning/40 bg-warning/10 text-warning-foreground rounded-lg border p-2 text-xs">
            {templateLoadWarnings.map((w, i) => (
              <p key={i}>⚠ {w}</p>
            ))}
          </div>
        )}

        {cart.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
            السلة فارغة. ابدأ بإضافة بنود.
          </p>
        ) : (
          <div className="space-y-2">
            {/* "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — a stable small display number per distinct groupKey present in the cart right now, purely for the badge below (not sent to the server). */}
            {(() => {
              const distinctGroupKeys = [...new Set(cart.map((l) => l.groupKey).filter((k): k is string => Boolean(k)))];
              return cart.map((line) => {
                const { costRows, materials, totalSheets } = cartLineBreakdownRows(line);
                const beingEdited = line.key === editingKey;
                const groupIndex = line.groupKey ? distinctGroupKeys.indexOf(line.groupKey) + 1 : null;
                return (
                  <div
                    key={line.key}
                    onClick={() => openLineForEdit(line)}
                    className={`border-border cursor-pointer rounded-lg border p-2 text-sm transition-colors hover:bg-muted/40 ${beingEdited ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {money(line.total)} ج.م {beingEdited && <span className="text-primary text-xs font-normal">(بيتعدل الآن)</span>}
                        </p>
                        {!!line.discountAmount && (
                          <p className="text-muted-foreground text-xs">
                            خصم {money(line.discountAmount)} ج.م — الصافي {money(line.total - line.discountAmount)} ج.م
                          </p>
                        )}
                        {/* Owner (2026-08-17, "عايزه يطلعلي سعر الدفتر الواحد والإجمالي مش بس سعر الإجمالي") — notebook-only, since that's the unit the owner prices tenders/quotes against. */}
                        {line.pricing.kind === 'NOTEBOOK' && line.pricing.notebookQuantity > 0 && (
                          <p className="text-muted-foreground text-xs">سعر الدفتر الواحد: {money(line.total / line.pricing.notebookQuantity)} ج.م</p>
                        )}
                        <p className="text-muted-foreground truncate text-xs">{line.summary}</p>
                        {groupIndex !== null && (
                          <span className="bg-info/10 text-info mt-1 inline-block rounded px-1.5 py-0.5 text-[10px]">
                            🔗 جزء من تصميم واحد #{groupIndex}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateLineAsVariant(line);
                          }}
                          className="text-primary text-xs"
                          aria-label="كرر بمقاس أو كمية مختلفة"
                          title="كرر بمقاس أو كمية مختلفة (نفس التصميم)"
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromCart(line.key);
                          }}
                          className="text-destructive text-xs"
                          aria-label="حذف البند"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  {/* Owner (2026-08-17) — بنود الحسبة (زنكات/تراج/ترقيم/ورق/تصميم...) وتوزيع الأفرخ على كل خامة، تحت كل بند في السلة مباشرة. */}
                  {costRows.length > 0 && (
                    <div className="text-muted-foreground mt-1.5 space-y-0.5 border-t pt-1.5 text-xs">
                      {costRows.map((r) => (
                        <div key={r.label} className="flex justify-between">
                          <span>{r.label}</span>
                          <span dir="ltr">{money(r.value)} ج.م</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {materials.length > 0 && (
                    <div className="text-muted-foreground mt-1.5 space-y-0.5 border-t pt-1.5 text-xs">
                      {materials.map((m, i) => (
                        <div key={`${m.role}-${i}`} className="flex justify-between">
                          <span>{notebookMaterialRoleLabel(m.role)}</span>
                          <span dir="ltr">{m.sheetsNeeded} فرخ × {m.sheetPrice.toFixed(2)} = {money(m.paperCost)} ج.م</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {totalSheets !== null && (
                    <div className="mt-1 flex justify-between border-t pt-1 text-xs font-medium">
                      <span>إجمالي الورق</span>
                      <span dir="ltr">{totalSheets} فرخ</span>
                    </div>
                  )}
                  </div>
                );
              });
            })()}
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

        {/* تعديلات يدوية على بنود التكلفة — للحالات الاستثنائية زي حساب مناقصة (owner, 2026-08-17). كل تعديل بيفضل معطل افتراضيًا ويستخدم قيمة الإعدادات، ويظهر بس للأنواع اللي فيها المفهوم ده أصلًا. */}
        {hasPrintSection && (
          <div className="border-border space-y-2 rounded-lg border p-2">
            <p className="text-muted-foreground text-xs font-medium">تعديل يدوي على بنود التكلفة (لحالات زي المناقصات)</p>
            <div className="flex flex-wrap items-center gap-2">
              <Checkbox
                checked={draft.zincPriceOverrideEnabled}
                onCheckedChange={(v) => updateDraft({ zincPriceOverrideEnabled: v === true })}
              />
              <span className="text-sm">سعر الزنكاية الواحدة</span>
              {draft.zincPriceOverrideEnabled ? (
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.zincPriceOverrideValue}
                  onChange={(e) => updateDraft({ zincPriceOverrideValue: e.target.value })}
                  className="border-input bg-background w-28 rounded-md border px-2 py-1 text-end text-sm"
                />
              ) : (
                <span className="text-muted-foreground text-xs">
                  الافتراضي من الإعدادات: {pricingReference.pricingConstants.zincPrice} ج.م
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Checkbox
                checked={draft.printRunPriceOverrideEnabled}
                onCheckedChange={(v) => updateDraft({ printRunPriceOverrideEnabled: v === true })}
              />
              <span className="text-sm">سعر تراج الطباعة الواحد</span>
              {draft.printRunPriceOverrideEnabled ? (
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.printRunPriceOverrideValue}
                  onChange={(e) => updateDraft({ printRunPriceOverrideValue: e.target.value })}
                  className="border-input bg-background w-28 rounded-md border px-2 py-1 text-end text-sm"
                />
              ) : (
                <span className="text-muted-foreground text-xs">
                  الافتراضي من الإعدادات: {pricingReference.pricingConstants.printRunPrice} ج.م
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Checkbox
                checked={draft.designCostOverrideEnabled}
                onCheckedChange={(v) => updateDraft({ designCostOverrideEnabled: v === true })}
              />
              <span className="text-sm">تكلفة التصميم</span>
              {draft.designCostOverrideEnabled ? (
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.designCostOverrideValue}
                  onChange={(e) => updateDraft({ designCostOverrideValue: e.target.value })}
                  className="border-input bg-background w-28 rounded-md border px-2 py-1 text-end text-sm"
                />
              ) : (
                <span className="text-muted-foreground text-xs">المحسوب تلقائيًا: {money(result?.designCost ?? 0)} ج.م</span>
              )}
            </div>
            {(draft.kind === 'LOOSE_PAPER' || draft.kind === 'NOTEBOOK') && (
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={draft.numberingRunPriceOverrideEnabled}
                  onCheckedChange={(v) => updateDraft({ numberingRunPriceOverrideEnabled: v === true })}
                />
                <span className="text-sm">سعر ترقيم التراج الواحد</span>
                {draft.numberingRunPriceOverrideEnabled ? (
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.numberingRunPriceOverrideValue}
                    onChange={(e) => updateDraft({ numberingRunPriceOverrideValue: e.target.value })}
                    className="border-input bg-background w-28 rounded-md border px-2 py-1 text-end text-sm"
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    الافتراضي من الإعدادات: {pricingReference.pricingConstants.numberingRunPrice} ج.م
                  </span>
                )}
              </div>
            )}
            {(draft.kind === 'LOOSE_PAPER' || draft.kind === 'NOTEBOOK' || draft.kind === 'FOLDER') && (
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={draft.wasteSheetsOverrideEnabled}
                  onCheckedChange={(v) => updateDraft({ wasteSheetsOverrideEnabled: v === true })}
                />
                <span className="text-sm">الهالك (أفرخ)</span>
                {draft.wasteSheetsOverrideEnabled ? (
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={draft.wasteSheetsOverrideValue}
                    onChange={(e) => updateDraft({ wasteSheetsOverrideValue: e.target.value })}
                    className="border-input bg-background w-28 rounded-md border px-2 py-1 text-end text-sm"
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    الافتراضي من الإعدادات: {pricingReference.pricingConstants.wasteSheetsDefault} فرخ
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Owner (2026-08-26, "أكتب السعر النهائي يدويًا للصنف ده"، same day: "في نقطة لازم النسبة تكون موجودة بردو... ده وده وانا اختار") — BOARDS/PRODUCT/SERVICE/INVENTORY_RETAIL never had a manual price-override concept before (no profit-margin step to hook into like the print-family kinds above), so this is a separate block rather than folded into "تعديل يدوي على بنود التكلفة" above. Two mutually exclusive modes: a flat replacement price, or a markup/markdown % on top of the catalog/computed price. */}
        {hasUnitPriceOverrideSection && (
          <div className="border-border space-y-2 rounded-lg border p-2">
            <p className="text-muted-foreground text-xs font-medium">تعديل يدوي على السعر (لحالات زي المناقصات)</p>
            <div className="flex flex-wrap items-center gap-2">
              <Checkbox checked={draft.priceOverrideEnabled} onCheckedChange={(v) => updateDraft({ priceOverrideEnabled: v === true })} />
              <span className="text-sm">{draft.kind === 'BOARDS' ? 'سعر المتر' : 'سعر الوحدة'}</span>
              {draft.priceOverrideEnabled ? (
                <>
                  <div className="border-input flex overflow-hidden rounded-md border text-xs">
                    <button
                      type="button"
                      onClick={() => updateDraft({ priceOverrideMode: 'FLAT' })}
                      className={`px-2 py-1 ${draft.priceOverrideMode === 'FLAT' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                    >
                      سعر ثابت
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraft({ priceOverrideMode: 'PERCENT' })}
                      className={`px-2 py-1 ${draft.priceOverrideMode === 'PERCENT' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                    >
                      نسبة %
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min={draft.priceOverrideMode === 'PERCENT' ? -100 : 0}
                    value={draft.priceOverrideValue}
                    onChange={(e) => updateDraft({ priceOverrideValue: e.target.value })}
                    placeholder={draft.priceOverrideMode === 'PERCENT' ? 'مثال: 10 أو -5' : undefined}
                    className="border-input bg-background w-28 rounded-md border px-2 py-1 text-end text-sm"
                  />
                  {draft.priceOverrideMode === 'PERCENT' && <span className="text-muted-foreground text-xs">%</span>}
                </>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {draft.kind === 'BOARDS'
                    ? `الافتراضي من الإعدادات: ${money(result?.pricePerMeter ?? 0)} ج.م`
                    : `سعر الكتالوج: ${money(result?.unitPrice ?? 0)} ج.م`}
                </span>
              )}
            </div>
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
          {itemDiscountsTotal > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">خصومات الأصناف</span>
              <span>-{money(itemDiscountsTotal)} ج.م</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">الخصم ({discountNum}%)</span>
            <span>-{money(subtotal - itemDiscountsTotal - afterDiscount)} ج.م</span>
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
              {walkIn ? (
                <p className="border-input bg-muted/30 text-muted-foreground rounded-md border px-3 py-2">عميل — بدون اسم</p>
              ) : (
                <div className="flex items-center gap-1">
                  <PartnerCombobox partners={localPartners} value={partnerId} onChange={setPartnerId} disabled={isEditing} />
                  {can('partners.create') && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddPartner(true)}>
                      + عميل جديد
                    </Button>
                  )}
                </div>
              )}
              {/* Owner (2026-08-20, "فاتورة بدون إسم العميل... ده عميل مش
                  ثابت ومش هحتاج احطه اصلا في الداتا بيز") — only meaningful
                  when every cart item is INVENTORY_RETAIL/MANUAL; enforced
                  again at submit time, this is just the entry point. */}
              {!isEditing && (
                <label className="text-muted-foreground flex items-center gap-1.5 pt-0.5 text-xs font-normal">
                  <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} />
                  <span>فاتورة بدون عميل — للبضاعة من المخزون والبنود اليدوية فقط</span>
                </label>
              )}
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
                  <span className="text-muted-foreground">شروط الدفع (اختياري)</span>
                  <input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="مثال: 50% مقدم والباقي عند التسليم"
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                {/* "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16, owner: "الغيها
                    خالص — النظام يحدد لوحده") — لا يوجد اختيار يدوي للمسار
                    الإنتاجي بعد اليوم؛ كل صنف بيحدد مساره أوتوماتيك حسب التاب
                    اللي اتضاف منه. التوجل ده بس لتحديد هل المسارات دي
                    محتاجة تصميم، ولو موجودة فعليًا في السلة. */}
                {tracksInCart
                  .filter((t) => SKIPPABLE_DESIGN_TRACKS.has(t))
                  .map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={requiresDesignByTrack[t] ?? true}
                        onChange={(e) => setRequiresDesignByTrack((prev) => ({ ...prev, [t]: e.target.checked }))}
                      />
                      <span>يحتاج تصميم؟ — {PRODUCTION_TRACK_LABELS[t]}</span>
                    </label>
                  ))}
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

          {/* Owner (2026-08-20, "لما اكتب المنتج جاهز للبيع ميطلبش مني إسم
              الصنف لأنه اوريدي إسم الصنف هو الإسم المتسجل في المخزون") —
              INVENTORY_RETAIL's `itemType` is always auto-set from the
              picked InventoryItem's own name (barcode scan or manual
              picker below), never freely typed — asking for it here was
              pure redundant friction, and inviting a typed name that could
              drift from the actual stock item's registered name. */}
          {draft.kind !== 'INVENTORY_RETAIL' && draft.kind !== 'MANUAL' && (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">اسم البند / العملية</span>
              <input
                value={draft.itemType}
                onChange={(e) => updateDraft({ itemType: e.target.value })}
                placeholder="مثال: فلايرز، كروت شخصية..."
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          )}

          {/* Owner (2026-08-20, "عايزها تظهر فيها تصنيفات الخزينة لأنها
              زيها زي الحركات اللي بتتعمل من الخزينة") — the manual line's
              own name reuses the exact same admin-managed التصنيفات
              catalog التصنيف dropdown already used in تسجيل حركة الخزينة
              (نفس المصدر، نفس شكل "تصنيف آخر" اليدوي)، بدل كتابة الاسم
              حر كل مرة من الصفر. */}
          {draft.kind === 'MANUAL' && (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">اسم البند</span>
              {manualCategoryCustom ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={draft.itemType}
                    onChange={(e) => updateDraft({ itemType: e.target.value })}
                    placeholder="اكتب اسم البند"
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setManualCategoryCustom(false);
                      updateDraft({ itemType: '' });
                    }}
                  >
                    إلغاء
                  </Button>
                </div>
              ) : (
                <select
                  value={draft.itemType}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setManualCategoryCustom(true);
                      updateDraft({ itemType: '' });
                    } else {
                      updateDraft({ itemType: e.target.value });
                    }
                  }}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">— اختر —</option>
                  {treasuryCategories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__custom__">بند آخر (كتابة يدوية)…</option>
                </select>
              )}
            </label>
          )}

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
                <Combobox
                  items={[{ id: '', name: '— بدون ورق —' }, ...paperInventoryItems]}
                  value={draft.inventoryItemId}
                  getKey={(p) => p.id}
                  getLabel={(p) => p.name}
                  onChange={(p) => updateDraft({ inventoryItemId: p.id })}
                  placeholder="— بدون ورق —"
                  searchPlaceholder="اكتب أول كام حرف من اسم الورق…"
                />
              </label>
            </div>
          )}

          {/* Owner (2026-08-17, "عايز انا اللي اقولك مقاس الطباعة وانت تشوف المقاس الفعلي هيبقى كام قطعة في مقاس الطباعه... وتحسب بناءا عليه عدد الأفرخ وكذلك عدد التراجات") — manual override of the print/calc size, right after "المقاس" since it's the same sizing concept. Defaults to the system's automatic tiering when off. */}
          {isSheetKind && (
            <div
              className={`space-y-2 rounded-xl border p-3 transition-colors ${
                draft.calcSizeOverrideEnabled ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/30'
              }`}
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={draft.calcSizeOverrideEnabled}
                  onCheckedChange={(v) =>
                    updateDraft({
                      calcSizeOverrideEnabled: v === true,
                      calcSizeOverrideValue: v === true ? draft.calcSizeOverrideValue : '',
                    })
                  }
                />
                <span aria-hidden className="text-base leading-none">🖨️</span>
                <span>مقاس الطباعة (اختياري)</span>
              </label>
              {draft.calcSizeOverrideEnabled ? (
                <>
                  <input
                    type="text"
                    list="calc-size-suggestions"
                    value={draft.calcSizeOverrideValue}
                    onChange={(e) => updateDraft({ calcSizeOverrideValue: e.target.value })}
                    placeholder="اكتب المقاس — مثال: 33×48"
                    className="border-primary/40 bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <datalist id="calc-size-suggestions">
                    {entries.map((en) => (
                      <option key={en.label} value={en.label} />
                    ))}
                  </datalist>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">
                  النظام هيحدد الفرخ المناسب تلقائيًا حسب الكمية والمقاس الحقيقي — فعّل ده لو عايز تختاره بنفسك
                </p>
              )}
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

          {/* Owner (2026-08-17, "بالنسبة للترقيم عايز بردو انا اللي اقولك مقاس الترقيم وانت تشوف مقاس الورق ده هياخد كام قطعة") — مباشرة بعد "بداية الترقيم" بما إنه امتداد لنفس فكرة الترقيم. LOOSE_PAPER/NOTEBOOK فقط — الوحيدين اللي فيهم ترقيم أصلًا. */}
          {(draft.kind === 'LOOSE_PAPER' || draft.kind === 'NOTEBOOK') && (
            <div
              className={`space-y-2 rounded-xl border p-3 transition-colors ${
                draft.numberingSizeOverrideEnabled ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/30'
              }`}
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={draft.numberingSizeOverrideEnabled}
                  onCheckedChange={(v) =>
                    updateDraft({
                      numberingSizeOverrideEnabled: v === true,
                      numberingSizeOverrideValue: v === true ? draft.numberingSizeOverrideValue : '',
                    })
                  }
                />
                <span aria-hidden className="text-base leading-none">🔢</span>
                <span>مقاس الترقيم (اختياري)</span>
              </label>
              {draft.numberingSizeOverrideEnabled ? (
                <>
                  <input
                    type="text"
                    list="numbering-size-suggestions"
                    value={draft.numberingSizeOverrideValue}
                    onChange={(e) => updateDraft({ numberingSizeOverrideValue: e.target.value })}
                    placeholder="اكتب مقاس الترقيم — مثال: 33×48"
                    className="border-primary/40 bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <datalist id="numbering-size-suggestions">
                    {entries.map((en) => (
                      <option key={en.label} value={en.label} />
                    ))}
                  </datalist>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">
                  النظام هيحدد مقاس الترقيم تلقائيًا — فعّل ده لو عايز تختاره بنفسك
                </p>
              )}
            </div>
          )}

          {/* صيغة تكلفة الورق الحية — نفس أرقام الفيديو، مبنية من نفس breakdown اللي المحرك بيرجّعه أصلًا */}
          {isSheetKind && result && typeof result.sheetsNeeded === 'number' && (
            <p className="bg-muted/40 rounded-md p-2 text-xs" dir="rtl">
              الكمية ({draft.kind === 'NOTEBOOK' ? draft.notebookQuantity : draft.quantity})
              {selectedEntry ? ` ÷ القطع في الفرخ (${selectedEntry.piecesPerSheet})` : ''} + الهالك (
              {draft.wasteSheetsOverrideEnabled ? toNum(draft.wasteSheetsOverrideValue) : pricingReference.pricingConstants.wasteSheetsDefault}
              ) = {result.sheetsNeeded} فرخ ×{' '}
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

          {/* Owner (2026-08-17, "عايز اقدر أعدل على عدد الورق الداخلي للدفتر... ممكن يكون 100 للأصل و100 للصورة... ممكن يكون 50 أصل فقط") — manual page-count overrides, replacing the fixed 100 (أصل فقط) / 50+50-لكل-نسخة (أصل + كربون) defaults. */}
          {draft.kind === 'NOTEBOOK' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div
                className={`space-y-2 rounded-xl border p-3 transition-colors ${
                  draft.originalPagesOverrideEnabled ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/30'
                }`}
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={draft.originalPagesOverrideEnabled}
                    onCheckedChange={(v) =>
                      updateDraft({
                        originalPagesOverrideEnabled: v === true,
                        originalPagesOverrideValue: v === true ? draft.originalPagesOverrideValue : '',
                      })
                    }
                  />
                  <span aria-hidden className="text-base leading-none">📄</span>
                  <span>عدد صفحات الأصل (اختياري)</span>
                </label>
                {draft.originalPagesOverrideEnabled ? (
                  <input
                    type="number"
                    min={1}
                    value={draft.originalPagesOverrideValue}
                    onChange={(e) => updateDraft({ originalPagesOverrideValue: e.target.value })}
                    className="border-primary/40 bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                ) : (
                  <p className="text-muted-foreground text-xs">
                    الافتراضي: {draft.contentType === 'ORIGINAL_ONLY' ? 100 : 50} صفحة للدفتر
                  </p>
                )}
              </div>
              {draft.contentType === 'ORIGINAL_PLUS_COPIES' && (
                <div
                  className={`space-y-2 rounded-xl border p-3 transition-colors ${
                    draft.copyPagesOverrideEnabled ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/30'
                  }`}
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={draft.copyPagesOverrideEnabled}
                      onCheckedChange={(v) =>
                        updateDraft({
                          copyPagesOverrideEnabled: v === true,
                          copyPagesOverrideValue: v === true ? draft.copyPagesOverrideValue : '',
                        })
                      }
                    />
                    <span aria-hidden className="text-base leading-none">📑</span>
                    <span>عدد صفحات كل نسخة (اختياري)</span>
                  </label>
                  {draft.copyPagesOverrideEnabled ? (
                    <input
                      type="number"
                      min={1}
                      value={draft.copyPagesOverrideValue}
                      onChange={(e) => updateDraft({ copyPagesOverrideValue: e.target.value })}
                      className="border-primary/40 bg-background w-full rounded-md border px-3 py-2 text-sm"
                    />
                  ) : (
                    <p className="text-muted-foreground text-xs">الافتراضي: 50 صفحة لكل نسخة</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* تعدد المواد الخام (2026-08-17، صاحب المشروع: "هختار نوع الورق
              لكل نسخة في الدفتر") — خانة مستقلة لكل نسخة كربون، مش أسامي
              ثابتة (أول/وسط/أخير). فاضي = نفس ورق الأصل، بالظبط زي السلوك
              القديم لو محدش لمس الخانات دي. */}
          {draft.kind === 'NOTEBOOK' && draft.contentType === 'ORIGINAL_PLUS_COPIES' && toNum(draft.copies) >= 1 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: toNum(draft.copies) }, (_, i) => (
                <label key={i} className="space-y-1 text-sm">
                  <span className="text-muted-foreground">ورق نسخة {i + 1} (لو مختلف عن الأصل)</span>
                  <Combobox
                    items={[{ id: '', name: '— زي ورق الأصل —' }, ...paperInventoryItems]}
                    value={draft.copyMaterials[i] ?? ''}
                    getKey={(p) => p.id}
                    getLabel={(p) => p.name}
                    onChange={(p) => {
                      const next = [...draft.copyMaterials];
                      next[i] = p.id;
                      updateDraft({ copyMaterials: next });
                    }}
                    placeholder="— زي ورق الأصل —"
                    searchPlaceholder="اكتب أول كام حرف من اسم الورق…"
                  />
                </label>
              ))}
            </div>
          )}

          {/* توزيع تكلفة الورق على المواد (2026-08-17) — يظهر بس لو فيه أكتر من مادة فعليًا مستخدمة. */}
          {draft.kind === 'NOTEBOOK' && result?.materials && result.materials.length > 1 && (
            <p className="bg-muted/40 rounded-md p-2 text-xs" dir="rtl">
              {result.materials
                .map((m) => `${notebookMaterialRoleLabel(m.role)}: ${m.sheetsNeeded} فرخ × ${m.sheetPrice.toFixed(2)} = ${money(m.paperCost)} ج.م`)
                .join(' — ')}
            </p>
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
              {/* owner: "لما اكتب مقاس الحتة الصغيرة عايز اعرف عددها كام في المتر" — calculateBoardsCost already computes this (piece-packing per square meter, gap from Settings), just wasn't shown here before. No formula change, purely display. */}
              {draft.material === 'VINYL_PRINT_CUT' && draftPreview.result?.piecesPerMeter !== undefined && (
                <p className="text-muted-foreground col-span-2 text-sm sm:col-span-4">
                  بيدخل <span className="text-foreground font-semibold">{draftPreview.result.piecesPerMeter}</span> قطعة
                  في المتر المربع الواحد — محتاج{' '}
                  <span className="text-foreground font-semibold">{draftPreview.result.metersNeeded}</span> متر عشان{' '}
                  {draft.quantity || 0} قطعة
                </p>
              )}
            </div>
          )}

          {/* تعدد المكونات (2026-08-17، صاحب المشروع: "الغلاف بتاعها خامة
              والداخلي خامة تانية") — كل مكوّن بيتحسب بمعادلة التنزيلة
              الخاصة بيه بالكامل ومستقل تمامًا، وبعدين المجاميع تتجمع. صنف
              ديجيتال بسيط (مكوّن واحد) هو نفس الحالة القديمة بمكوّن واحد بس. */}
          {draft.kind === 'DIGITAL' &&
            draft.digitalComponents.map((component, index) => {
              const componentResult = result?.components?.[index];
              const updateComponent = (patch: Partial<DraftDigitalComponent>) =>
                updateDraft({
                  digitalComponents: draft.digitalComponents.map((c, i) => (i === index ? { ...c, ...patch } : c)),
                });
              return (
                <div key={component.key} className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex-1 space-y-1 text-sm">
                      <span className="text-muted-foreground">اسم المكوّن (مثلاً: الغلاف/الداخلي)</span>
                      <input
                        type="text"
                        value={component.label}
                        placeholder={draft.digitalComponents.length > 1 ? `المكوّن ${index + 1}` : 'اسم اختياري'}
                        onChange={(e) => updateComponent({ label: e.target.value })}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </label>
                    {draft.digitalComponents.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateDraft({ digitalComponents: draft.digitalComponents.filter((_, i) => i !== index) })}
                      >
                        حذف المكوّن
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">أساس الطباعة</span>
                      <select
                        value={component.printBasis}
                        onChange={(e) => updateComponent({ printBasis: e.target.value as DigitalPrintBasis })}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      >
                        <option value="QUARTER">الربع (تنزيلة/Yield)</option>
                        <option value="A4_DIRECT">A4 مباشر (نسخة = ورقة كاملة)</option>
                        <option value="A3_DIRECT">A3 مباشر (نسخة = ورقة كاملة)</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">الألوان</span>
                      <select
                        value={component.colorMode}
                        onChange={(e) => updateComponent({ colorMode: e.target.value as DigitalColorMode })}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      >
                        <option value="COLOR">ألوان</option>
                        <option value="BW">أبيض وأسود</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">الأوجه</span>
                      <select
                        value={component.sides}
                        onChange={(e) => updateComponent({ sides: e.target.value as DigitalSides })}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      >
                        <option value="SINGLE">وجه</option>
                        <option value="DOUBLE">وجه وظهر</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="text-muted-foreground">نوع الورق (يُسحب من المخزن)</span>
                      <Combobox
                        items={paperInventoryItems}
                        value={component.inventoryItemId}
                        getKey={(p) => p.id}
                        getLabel={(p) => p.name}
                        onChange={(p) => updateComponent({ inventoryItemId: p.id })}
                        searchPlaceholder="اكتب أول كام حرف من اسم الورق…"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">عرض القطعة (سم)</span>
                      <input
                        type="number"
                        min={0.1}
                        step="0.1"
                        value={component.widthCm}
                        onChange={(e) => {
                          const widthCm = e.target.value;
                          const w = Number(widthCm);
                          const h = Number(component.heightCm);
                          const suggested =
                            w > 0 && h > 0
                              ? suggestYield(
                                  w,
                                  h,
                                  pricingReference.digitalConstants.digitalQuarterWidthCm,
                                  pricingReference.digitalConstants.digitalQuarterHeightCm,
                                )
                              : 0;
                          updateComponent({ widthCm, yieldPerQuarter: suggested > 0 ? String(suggested) : component.yieldPerQuarter });
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
                        value={component.heightCm}
                        onChange={(e) => {
                          const heightCm = e.target.value;
                          const w = Number(component.widthCm);
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
                          updateComponent({ heightCm, yieldPerQuarter: suggested > 0 ? String(suggested) : component.yieldPerQuarter });
                        }}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">الكمية</span>
                      <input
                        type="number"
                        min={1}
                        value={component.quantity}
                        onChange={(e) => updateComponent({ quantity: e.target.value })}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </label>
                    {component.printBasis === 'QUARTER' && (
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">التنزيلة (Yield) — عدد القطع في الربع</span>
                        <input
                          type="number"
                          min={1}
                          value={component.yieldPerQuarter}
                          onChange={(e) => updateComponent({ yieldPerQuarter: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                    )}
                    {component.printBasis === 'QUARTER' && (
                      <label className="flex items-center gap-2 self-end text-sm">
                        <input
                          type="checkbox"
                          checked={component.sellophaneEnabled}
                          onChange={(e) => updateComponent({ sellophaneEnabled: e.target.checked })}
                        />
                        سلوفان
                      </label>
                    )}
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">سعر البشر للقطعة (اختياري)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={component.boshrPricePerPiece}
                        onChange={(e) => updateComponent({ boshrPricePerPiece: e.target.value })}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  {/* صيغة تكلفة المكوّن الحية — نظام التنزيلة، system_specifications_v2.md §13.3 */}
                  {componentResult && (
                    <p className="bg-muted/40 rounded-md p-2 text-xs" dir="rtl">
                      {componentResult.fitsInQuarter === false && componentResult.unitsNeeded
                        ? `القطعة أكبر من الربع — محتاجة ${componentResult.unitsNeeded} ربع/قطعة`
                        : `التنزيلة: ${component.yieldPerQuarter} قطعة في الربع`}
                      {' — '}تكلفة القطعة {money(componentResult.costPerPiece)} ج.م × الكمية ({component.quantity})
                      {typeof componentResult.sheetsNeeded === 'number' && (
                        <>
                          {' — '}
                          محتاجين ≈ {componentResult.sheetsNeeded} فرخ (بيتخصم من المخزون)
                        </>
                      )}
                    </p>
                  )}
                </div>
              );
            })}

          {draft.kind === 'DIGITAL' && (
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => updateDraft({ digitalComponents: [...draft.digitalComponents, emptyDigitalComponent()] })}
              >
                + أضف مكوّن (زي الغلاف/الداخلي)
              </Button>
              {draft.digitalComponents.length > 1 && typeof result?.total === 'number' && (
                <p className="text-muted-foreground text-xs">إجمالي كل المكونات: {money(result.total)} ج.م</p>
              )}
            </div>
          )}

          {draft.kind === 'PRODUCT' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">المنتج</span>
                <Combobox
                  items={readyProducts}
                  value={draft.readyProductId}
                  getKey={(p) => p.id}
                  getLabel={(p) => `${p.name}${p.sourceType ? ` (${PRODUCT_SOURCE_TYPE_LABELS[p.sourceType]})` : ''}`}
                  onChange={(p) => updateDraft({ readyProductId: p.id })}
                  searchPlaceholder="اكتب أول كام حرف من اسم المنتج…"
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
              {/* Owner (2026-08-23, "اكتب اسم المورد منين وانا بطلب؟") — pre-fills the "الإحضار من المورد" workflow stage once production reaches it. */}
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">المورد (اختياري — لو هيتحضر من مورد خارجي)</span>
                <PartnerCombobox
                  partners={partners}
                  value={draft.preferredSupplierId}
                  onChange={(id) => updateDraft({ preferredSupplierId: id })}
                  placeholder="— بدون —"
                />
              </label>
            </div>
          )}

          {draft.kind === 'SERVICE' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">الخدمة</span>
                <Combobox
                  items={services.filter((s) => !activeSubTab?.serviceCategory || s.category === activeSubTab.serviceCategory)}
                  value={draft.serviceId}
                  getKey={(s) => s.id}
                  getLabel={(s) => s.name}
                  onChange={(s) => updateDraft({ serviceId: s.id })}
                  searchPlaceholder="اكتب أول كام حرف من اسم الخدمة…"
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
              {/* ERP-navigation research (2026-08-16) — a scope-of-work definition is what actually prevents disputes over a creative/agency service later; distinct from the generic "ملاحظات" note below (which prints on the job-card, not meant for defining deliverables). */}
              <label className="col-span-2 space-y-1 text-sm sm:col-span-4">
                <span className="text-muted-foreground">نطاق العمل (اختياري) — إيه اللي الخدمة دي بتشمله بالظبط</span>
                <textarea
                  value={draft.description}
                  onChange={(e) => updateDraft({ description: e.target.value })}
                  rows={2}
                  placeholder="مثال: هوية بصرية تشمل شعار + ٣ نسخ ألوان + دليل استخدام مبسط، مراجعتين مجانًا"
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          {draft.kind === 'INVENTORY_RETAIL' && (
            <div className="space-y-3">
              {/* Owner (2026-08-20, "بيع سريع دي تتحط... في قسم بيع من
                  المخزون") — a shortcut out of the whole order/invoice flow
                  for a simple stock sale (see QuickSaleDialog below). */}
              {can('inventory.create') && can('treasury.create') && (
                <button
                  type="button"
                  onClick={() => setShowQuickSale(true)}
                  className="text-primary text-xs hover:underline"
                >
                  ⚡ بيع سريع — بدون فاتورة (يخصم من المخزون ويسجل في الخزينة على طول)
                </button>
              )}
              <div className="border-border bg-muted/30 space-y-2 rounded-lg border p-3">
                <span className="text-muted-foreground text-sm">امسح الباركود — بيتضاف للفاتورة فورًا</span>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    dir="ltr"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void scanBarcode();
                      }
                    }}
                    placeholder="امسح الباركود هنا…"
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                  <Button type="button" variant="secondary" onClick={() => void scanBarcode()} disabled={barcodeLoading}>
                    {barcodeLoading ? '...' : 'إضافة'}
                  </Button>
                </div>
                {barcodeError && <p className="text-destructive text-sm">{barcodeError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">أو اختر يدويًا</span>
                  <InventoryItemCombobox
                    items={inventoryItems.filter((i) => i.category === 'READY_MADE' && i.salePrice !== null)}
                    value={draft.inventoryItemId}
                    onChange={(item) => updateDraft({ inventoryItemId: item.id, itemType: item.name })}
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
              </div>
            </div>
          )}

          {/* Owner (2026-08-20, "اقدر ازود على الفاتورة حركة اكتبها يدوي
              زي حركات الخزينة") — free-text line (اسم البند above is its
              label), manually-priced, no formula, no catalog. */}
          {draft.kind === 'MANUAL' && (
            <div className="space-y-2">
              {/* Owner (2026-08-20, "في تاب بند يدوي، البيع السريع يعني
                  إيه؟" → "يسجل قيد دخل خزينة بس، بدون مخزون") — MANUAL has
                  no inventory item to deduct from at all (see
                  QuickManualIncomeDialog below). */}
              {can('treasury.create') && (
                <button
                  type="button"
                  onClick={() => setShowQuickIncome(true)}
                  className="text-primary text-xs hover:underline"
                >
                  ⚡ بيع سريع — قيد خزينة بدون فاتورة
                </button>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">السعر</span>
                  <input
                    autoFocus
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.unitPrice}
                    onChange={(e) => updateDraft({ unitPrice: e.target.value })}
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
              </div>
            </div>
          )}

          {/* صيغة تكلفة الطباعة الحية */}
          {hasPrintSection && result && (typeof result.zincCost === 'number' || typeof result.printCost === 'number') && (
            <p className="bg-muted/40 rounded-md p-2 text-xs" dir="rtl">
              الزنكات: {draft.colorCount} × {pricingReference.pricingConstants.zincPrice} = {money(result.zincCost ?? 0)} ج.م — التراجات:{' '}
              {result.printRuns ?? 0} × {pricingReference.pricingConstants.printRunPrice} = {money(result.printCost ?? 0)} ج.م
            </p>
          )}

          {/* الخدمات الإضافية — قائمة قابلة للإدارة من الإعدادات (owner، 2026-08-17)، ومفلترة حسب القسم النشط (owner، 2026-08-20: "عايز الخدمات الإضافية دي على حسب القسم") — بند فاضي applicableTracks معناه يظهر لكل الأقسام. مش متاحة للبند اليدوي (MANUAL) — السعر كله بيتكتب يدوي أصلاً، مفيش مفهوم "إضافي" عليه. */}
          {draft.kind !== 'MANUAL' && (
          <div className="space-y-2">
            <p className="text-sm font-medium">الخدمات الإضافية</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {draft.extraServices
                .map((row, idx) => ({ row, idx }))
                .filter(({ row }) => {
                  const option = extraServiceOptions.find((o) => o.id === row.optionId);
                  const currentTrack = resolveProductionTrackForTab(activeParentId);
                  return !option || option.applicableTracks.length === 0 || (currentTrack !== null && option.applicableTracks.includes(currentTrack));
                })
                .map(({ row, idx }) => (
                <div key={row.optionId || row.label} className="border-border flex flex-col gap-1 rounded-lg border p-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={row.enabled}
                      onCheckedChange={(v) =>
                        updateDraft({
                          extraServices: draft.extraServices.map((s, i) => (i === idx ? { ...s, enabled: v === true } : s)),
                        })
                      }
                    />
                    {row.label}
                  </label>
                  {row.enabled && (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="المبلغ"
                      value={row.amount}
                      onChange={(e) =>
                        updateDraft({
                          extraServices: draft.extraServices.map((s, i) => (i === idx ? { ...s, amount: e.target.value } : s)),
                        })
                      }
                      className="border-input bg-background w-full rounded-md border px-2 py-1 text-end text-xs"
                    />
                  )}
                </div>
              ))}
              {draft.extraServices.length === 0 && (
                <p className="text-muted-foreground col-span-full text-xs">
                  مفيش خدمات إضافية معرّفة — ضيفها من الإعدادات → إعدادات الطباعة.
                </p>
              )}
            </div>
          </div>
          )}

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

          {/* Owner (2026-08-23, "تخفيض على صنف محدد وليس بالضرورة كل الفاتورة") — an absolute discount on this line alone, independent of the order-level نسبة الخصم %. */}
          {!draftPreview.error && (
            <label className="flex items-center gap-2 border-t pt-2 text-sm">
              <span className="text-muted-foreground">خصم على البند ده</span>
              <input
                type="number"
                min={0}
                max={draftPreview.total}
                step={0.01}
                value={draft.discountAmount}
                onChange={(e) => updateDraft({ discountAmount: e.target.value })}
                className="border-input bg-background w-28 rounded-md border px-2 py-1 text-sm"
              />
              <span className="text-muted-foreground text-xs">ج.م</span>
            </label>
          )}

          <div className="flex items-center justify-between border-t pt-2">
            <div>
              <p className="text-sm font-medium">
                سعر البند:{' '}
                <span className={draftPreview.error ? 'text-destructive' : 'text-foreground'}>
                  {draftPreview.error ?? `${money(draftPreview.total)} ج.م`}
                </span>
              </p>
              {!draftPreview.error && toNum(draft.discountAmount) > 0 && (
                <p className="text-muted-foreground text-xs">
                  بعد الخصم: {money(Math.max(0, draftPreview.total - toNum(draft.discountAmount)))} ج.م
                </p>
              )}
              {draft.kind === 'NOTEBOOK' && !draftPreview.error && toNum(draft.notebookQuantity) > 0 && (
                <p className="text-muted-foreground text-xs">
                  سعر الدفتر الواحد: {money(draftPreview.total / toNum(draft.notebookQuantity))} ج.م
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {editingKey && (
                <Button type="button" variant="secondary" onClick={cancelEditingLine}>
                  إلغاء التعديل
                </Button>
              )}
              <Button type="button" onClick={addToCart}>
                {editingKey ? '💾 حفظ التعديل' : '🛒 إضافة للفاتورة'}
              </Button>
            </div>
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
      {showQuickSale && (
        <QuickSaleDialog
          items={inventoryItems.filter((i) => i.category === 'READY_MADE' && i.salePrice !== null)}
          categories={treasuryCategories}
          onClose={() => setShowQuickSale(false)}
        />
      )}
      {showQuickIncome && (
        <QuickManualIncomeDialog branchId={branchId} categories={treasuryCategories} onClose={() => setShowQuickIncome(false)} />
      )}
    </div>
  );
}

/** One row in the multi-item quick-sale cart — `key` is a client-only id, never sent to the server. */
interface QuickSaleLine {
  key: string;
  itemId: string;
  item: InventoryItem | null;
  quantity: string;
  unitPrice: string;
  /** Set once this line's own `POST .../quick-sale` call has succeeded — kept out of the retry set if a later line in the same batch fails. */
  done: boolean;
}

let quickSaleLineSeq = 0;
function emptyQuickSaleLine(): QuickSaleLine {
  quickSaleLineSeq += 1;
  return { key: `qsl-${quickSaleLineSeq}`, itemId: '', item: null, quantity: '1', unitPrice: '', done: false };
}

/**
 * Owner (2026-08-20, "لو حد خد صنف بسيط من قسم بضاعة من المخزون مش مضطر
 * اطلع عليه فاتورة وعايزة يتسجل في حركة الخزينة ويخصمه من المخزن", then
 * "بيع سريع دي تتحط... في قسم بيع من المخزون وقسم البنود اليدوي", then
 * "زيادة العدد في البيع السريع — أقدر اعمل بيع سريع لكذا صنف مع بعض مش
 * صنف واحد") — a one-step cash sale with no Order/invoice at all, surfaced
 * right inside the composer's "بضاعة من المخزون" tab. A "sale" here can
 * cover several different items in one go, sharing one payment method/
 * category/note — but the backend endpoint (`POST
 * /api/inventory-items/:id/quick-sale`) is still exactly one item at a
 * time (its own atomic StockMovement+TreasuryEntry pair, rule 5 — not
 * touched/duplicated), so this cart submits sequentially, one call per
 * line, and tracks each line's own success/failure so a mid-batch failure
 * never re-submits lines that already succeeded.
 */
function QuickSaleDialog({
  items,
  categories,
  onClose,
}: {
  items: InventoryItem[];
  categories: TreasuryCategory[];
  onClose: () => void;
}) {
  const [lines, setLines] = useState<QuickSaleLine[]>([emptyQuickSaleLine()]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateLine = (key: string, patch: Partial<QuickSaleLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const selectLineItem = (key: string, item: InventoryItem) => {
    updateLine(key, { itemId: item.id, item, unitPrice: item.salePrice !== null ? String(item.salePrice) : '' });
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  };

  const lineTotal = (line: QuickSaleLine) => {
    const q = Number(line.quantity);
    const p = Number(line.unitPrice);
    return q > 0 && p >= 0 ? q * p : 0;
  };
  const grandTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const pendingLines = lines.filter((l) => !l.done);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    for (const line of pendingLines) {
      const q = Number(line.quantity);
      const p = Number(line.unitPrice);
      if (!line.item) {
        setError('اختر الصنف لكل بند في السلة');
        return;
      }
      if (!line.quantity || Number.isNaN(q) || q <= 0) {
        setError(`اكتب كمية أكبر من صفر لصنف "${line.item.name}"`);
        return;
      }
      if (!line.unitPrice || Number.isNaN(p) || p < 0) {
        setError(`اكتب سعر بيع صحيح لصنف "${line.item.name}"`);
        return;
      }
    }
    setError(null);
    setSubmitting(true);

    let failedCount = 0;
    for (const line of pendingLines) {
      const input: QuickInventorySaleInput = {
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        method,
        category: category || undefined,
        note: note.trim() || undefined,
      };
      try {
        await apiPost(`/api/inventory-items/${line.item!.id}/quick-sale`, input);
        updateLine(line.key, { done: true });
      } catch (err) {
        failedCount += 1;
        setError(`تعذر بيع "${line.item!.name}": ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
        break; // stop at the first failure — already-done lines stay marked done, not resubmitted on retry.
      }
    }
    setSubmitting(false);
    if (failedCount === 0) setSaved(true);
  };

  if (saved) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تم البيع بنجاح</DialogTitle>
          </DialogHeader>
          <div className="text-success space-y-1 text-sm">
            {lines.map((l) => (
              <p key={l.key}>
                {l.quantity} × "{l.item?.name}"
              </p>
            ))}
            <p>خُصمت من المخزون واتسجلت في الخزينة.</p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => {
                setSaved(false);
                setLines([emptyQuickSaleLine()]);
                setNote('');
              }}
            >
              بيع تاني
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              تم
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>بيع سريع — بدون فاتورة</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <p className="text-muted-foreground text-sm">
            بيع نقدي مباشر — ممكن أكتر من صنف مع بعض، بيخصموا من المخزون ويتسجلوا في الخزينة على طول، من غير أي
            فاتورة أو مستند.
          </p>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div
                key={line.key}
                className={`border-border grid grid-cols-[1fr_auto_auto_auto] items-end gap-2 rounded-lg border p-2 ${line.done ? 'bg-success/5 opacity-60' : ''}`}
              >
                <label className="block space-y-1 text-sm">
                  {idx === 0 && <span className="text-muted-foreground">الصنف</span>}
                  <InventoryItemCombobox
                    items={items}
                    value={line.itemId}
                    onChange={(item) => selectLineItem(line.key, item)}
                    placeholder="اختر الصنف…"
                    disabled={line.done}
                  />
                </label>
                <label className="block w-24 space-y-1 text-sm">
                  {idx === 0 && <span className="text-muted-foreground">الكمية</span>}
                  <input
                    type="number"
                    min={0.001}
                    step="0.001"
                    required
                    disabled={line.done}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                  />
                </label>
                <label className="block w-28 space-y-1 text-sm">
                  {idx === 0 && <span className="text-muted-foreground">سعر القطعة</span>}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    disabled={line.done}
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={line.done || lines.length === 1}
                  onClick={() => removeLine(line.key)}
                  title="حذف الصنف من السلة"
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, emptyQuickSaleLine()])}>
            + إضافة صنف تاني
          </Button>

          <p className="text-sm">
            الإجمالي:{' '}
            <span className="font-bold" dir="ltr">
              {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>{' '}
            ج.م
          </p>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">طريقة التحصيل</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">تصنيف الخزينة (اختياري — الافتراضي "مبيعات نقدية")</span>
            {customCategory ? (
              <div className="flex gap-1.5">
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="اكتب تصنيف جديد"
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCustomCategory(false);
                    setCategory('');
                  }}
                >
                  إلغاء
                </Button>
              </div>
            ) : (
              <select
                value={category}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomCategory(true);
                    setCategory('');
                  } else {
                    setCategory(e.target.value);
                  }
                }}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">مبيعات نقدية (افتراضي)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="__custom__">تصنيف آخر (كتابة يدوية)…</option>
              </select>
            )}
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">ملاحظة (اختياري)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting || pendingLines.length === 0}>
              {submitting ? 'جارٍ الحفظ…' : pendingLines.length < lines.length ? 'إعادة محاولة الباقي' : 'تأكيد البيع'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Owner (2026-08-20, "في تاب بند يدوي، البيع السريع يعني إيه؟" → "يسجل قيد
 * دخل خزينة بس، بدون مخزون") — MANUAL items were never linked to an
 * inventory item (a free-text, manually-priced line — see MANUAL's own
 * pricing kind), so there's no stock to deduct here. This is simply a fast
 * path to a plain treasury income entry, reusing the exact same
 * `POST /api/treasury-entries` endpoint `TreasuryPage.tsx`'s own "حركة
 * جديدة" form already uses (rule 5 — no second copy of that logic), just
 * as a compact modal reachable from the order composer.
 */
function QuickManualIncomeDialog({
  branchId,
  categories,
  onClose,
}: {
  branchId: string;
  categories: TreasuryCategory[];
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const parsedAmount = Number(amount);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('اكتب مبلغ أكبر من صفر');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateTreasuryEntryInput = {
        type: 'INCOME',
        amount: parsedAmount,
        method,
        category: category || undefined,
        note: note.trim() || undefined,
        date: new Date().toISOString(),
        branchId,
      };
      await apiPost('/api/treasury-entries', input);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل القيد');
    } finally {
      setSubmitting(false);
    }
  };

  if (saved) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تم التسجيل بنجاح</DialogTitle>
          </DialogHeader>
          <p className="text-success text-sm">اتسجل قيد دخل بمبلغ {parsedAmount.toLocaleString('en-US')} ج.م في الخزينة.</p>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => {
                setSaved(false);
                setAmount('');
                setNote('');
              }}
            >
              قيد تاني
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              تم
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>بيع سريع — قيد خزينة بدون فاتورة</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <p className="text-muted-foreground text-sm">
            البند اليدوي مش مرتبط بصنف مخزون، فمفيش رصيد يتخصم — ده بس بيسجل مبلغ دخل في الخزينة على طول، من غير
            فاتورة.
          </p>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">المبلغ</span>
            <input
              autoFocus
              type="number"
              min={0}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">طريقة التحصيل</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">تصنيف الخزينة (اختياري)</span>
            {customCategory ? (
              <div className="flex gap-1.5">
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="اكتب تصنيف جديد"
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCustomCategory(false);
                    setCategory('');
                  }}
                >
                  إلغاء
                </Button>
              </div>
            ) : (
              <select
                value={category}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomCategory(true);
                    setCategory('');
                  } else {
                    setCategory(e.target.value);
                  }
                }}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">— بدون —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="__custom__">تصنيف آخر (كتابة يدوية)…</option>
              </select>
            )}
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">ملاحظة (اختياري)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'تأكيد التسجيل'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
