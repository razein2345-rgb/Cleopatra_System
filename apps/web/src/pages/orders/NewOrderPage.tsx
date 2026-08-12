import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  Attachment,
  BoardMaterial,
  BranchSummary,
  BusinessPartner,
  CreateOrderInput,
  CreatePaymentInput,
  CreateQuotationInput,
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
  WorkflowTemplate,
  WorkOrder,
} from '@cleopatra/shared';
import {
  calculateBoardsCost,
  calculateEnvelopeCost,
  calculateFolderCost,
  calculateLoosePaperCost,
  calculateNotebookCost,
  calculateProductOrServiceCost,
} from '@cleopatra/shared';
import { apiGet, apiPost, apiPostFormData } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/state/AuthContext';

type PricingKind = OrderItemPricingInput['kind'];
/** Which document the unified الطلبات والمستندات screen saves the same item set as (owner, 2026-08-10 — one creation flow, two destinations). Work Order generation is a follow-on action on an already-created Invoice, not a third save target — a WorkOrder always wraps an existing Order (see `createWorkOrder`'s own doc comment). */
type DocumentType = 'INVOICE' | 'QUOTATION';

const KIND_LABELS: Record<PricingKind, string> = {
  LOOSE_PAPER: 'ورق سايب',
  NOTEBOOK: 'دفاتر',
  ENVELOPE: 'أظرف',
  FOLDER: 'فولدرات',
  BOARDS: 'لوحات وإعلانات',
  PRODUCT: 'منتج جاهز',
  SERVICE: 'خدمة',
};
/** Everything except NOTEBOOK — the video's "مطبوعات ورقية وخدمات" tab (owner, 2026-08-12: keep all 7 real pricing kinds intact, just regroup visually to match the reference video's two-tab layout instead of collapsing them into the video's own simpler generic model). */
const PAPER_AND_SERVICES_KINDS: PricingKind[] = ['LOOSE_PAPER', 'ENVELOPE', 'FOLDER', 'BOARDS', 'PRODUCT', 'SERVICE'];

/** FEATURE-007 WF-B — matches `WorkflowTemplate.code` for the 4 tracks seeded by WF-A; the customer's chosen track routes the eventual Work Order, never inferred from item kind (owner, 2026-08-12). */
const PRODUCTION_TRACK_LABELS: Record<ProductionTrack, string> = {
  OFFSET: 'أوفست',
  DIGITAL: 'ديجيتال',
  BOARDS_SIGNAGE: 'لوحات وإعلانات',
  OTHER_PRODUCTS: 'منتجات أخرى',
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
    case 'PRODUCT':
      return `${readyProducts.find((p) => p.id === d.readyProductId)?.name ?? d.itemType} × ${d.quantity}`;
    case 'SERVICE':
      return `${services.find((s) => s.id === d.serviceId)?.name ?? d.itemType} × ${d.quantity}`;
  }
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

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
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [readyProducts, setReadyProducts] = useState<ReadyProduct[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [pricingReference, setPricingReference] = useState<PricingReference | null>(null);
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
    ])
      .then(([p, b, rp, s, inv, pricing]) => {
        setPartners(p);
        setBranches(b);
        setReadyProducts(rp);
        setServices(s);
        setInventoryItems(inv);
        setPricingReference(pricing);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'تعذر تحميل البيانات'))
      .finally(() => setLoading(false));
  }, []);

  if (loadError) return <div className="text-destructive text-sm">{loadError}</div>;
  if (loading || !pricingReference) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

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
        <GenerateWorkOrderPanel orderId={order.id} productionTrack={order.productionTrack} />
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
}: {
  partners: BusinessPartner[];
  branches: BranchSummary[];
  readyProducts: ReadyProduct[];
  services: Service[];
  inventoryItems: InventoryItem[];
  pricingReference: PricingReference;
  onCreated: (result: CreatedResult) => void;
}) {
  const { can } = useAuth();
  const canInvoice = can('orders.create');
  const canQuotation = can('quotations.create');
  const [documentType, setDocumentType] = useState<DocumentType>(canInvoice ? 'INVOICE' : 'QUOTATION');
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? '');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [productionTrack, setProductionTrack] = useState<ProductionTrack | ''>('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [discountPercent, setDiscountPercent] = useState('0');
  const [vatOn, setVatOn] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // بنود الفاتورة — السلة الفعلية (بعد "إضافة للفاتورة" بس)
  const [cart, setCart] = useState<CartLine[]>([]);
  // النموذج على اليمين — بند واحد بيتصمم في المرة (نمط الفيديو)
  const [activeTab, setActiveTab] = useState<'PAPER_SERVICES' | 'NCR'>('PAPER_SERVICES');
  const [draft, setDraft] = useState<DraftItem>(() => emptyDraftItem());
  const [itemError, setItemError] = useState<string | null>(null);

  // التحصيل — دفعات عند الإنشاء (فاتورة فقط)
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'SAVE_ONLY' | 'SAVE_AND_PRINT' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const paperInventoryItems = useMemo(() => inventoryItems.filter((i) => i.sheetPrice !== null), [inventoryItems]);

  const ctx: PricingCtx = useMemo(
    () => ({
      families: pricingReference.sizeFamilies,
      pricingConstants: pricingReference.pricingConstants,
      boardsConstants: pricingReference.boardsConstants,
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
  const finalTotal = afterDiscount + vatAmount;
  const paidTotal = payments.reduce((sum, p) => sum + (toOptionalNum(p.amount) ?? 0), 0);
  const remainingBalance = finalTotal - paidTotal;

  const updateDraft = (patch: Partial<DraftItem>) => setDraft((prev) => ({ ...prev, ...patch }));

  const switchTab = (tab: 'PAPER_SERVICES' | 'NCR') => {
    setActiveTab(tab);
    if (tab === 'NCR' && draft.kind !== 'NOTEBOOK') {
      setDraft(emptyDraftItem('NOTEBOOK'));
    } else if (tab === 'PAPER_SERVICES' && draft.kind === 'NOTEBOOK') {
      setDraft(emptyDraftItem('LOOSE_PAPER'));
    }
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
      readyProductId: draft.kind === 'PRODUCT' ? draft.readyProductId || undefined : undefined,
      serviceId: draft.kind === 'SERVICE' ? draft.serviceId || undefined : undefined,
      attachmentId: draft.attachmentId || undefined,
      attachmentUrl: draft.attachmentUrl || undefined,
      pricing,
      total: preview.total,
    };
    setCart((prev) => [...prev, line]);
    setDraft(emptyDraftItem(activeTab === 'NCR' ? 'NOTEBOOK' : 'LOOSE_PAPER'));
  };

  const removeFromCart = (key: string) => setCart((prev) => prev.filter((line) => line.key !== key));

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
    if (documentType === 'QUOTATION' && !validUntil) {
      setError('حدد تاريخ صلاحية عرض السعر');
      return;
    }

    // Same item shape either way — `createQuotationItemSchema` and
    // `createOrderItemSchema` are structurally identical (FEATURE-007,
    // one Pricing Engine for both), so only the wrapping document differs.
    const outputItems = cart.map((line) => ({
      itemType: line.itemType,
      notes: line.notes,
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
      if (documentType === 'QUOTATION') {
        const input: CreateQuotationInput = {
          partnerId,
          branchId,
          validUntil: new Date(validUntil).toISOString(),
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
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      {/* عمود يمين — السلة (بنود الفاتورة/العرض) */}
      <aside className="border-border bg-card sticky top-4 order-2 h-fit space-y-3 rounded-2xl border p-4 lg:order-1">
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

        {documentType === 'INVOICE' && (
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

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="space-y-2 border-t pt-2">
          <Button type="button" className="w-full" disabled={submitting !== null} onClick={() => void submit('SAVE_AND_PRINT')}>
            {submitting === 'SAVE_AND_PRINT' ? 'جارٍ الحفظ…' : '🖶 حفظ وطباعة'}
          </Button>
          <Button type="button" variant="outline" className="w-full" disabled={submitting !== null} onClick={() => void submit('SAVE_ONLY')}>
            {submitting === 'SAVE_ONLY' ? 'جارٍ الحفظ…' : 'حفظ فقط'}
          </Button>
        </div>
      </aside>

      {/* عمود شمال — نموذج إضافة بند + بيانات المستند */}
      <div className="order-1 space-y-4 lg:order-2">
        <h1 className="text-2xl font-bold">الطلبات والمستندات</h1>

        {canInvoice && canQuotation && (
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
              <select
                required
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">— اختر —</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">الفرع</span>
              <select
                required
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
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
              <p className="border-input bg-muted/30 text-muted-foreground rounded-md border px-3 py-2">يُحدَّد تلقائيًا بعد الحفظ</p>
            </div>
            {documentType === 'QUOTATION' ? (
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">صالح حتى</span>
                <input
                  required
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
              </>
            )}
          </div>
        </div>

        {/* التابين — مطبوعات ورقية وخدمات / دفاتر مكررة NCR */}
        <div className="border-border bg-muted/30 inline-flex rounded-lg border p-1 text-sm">
          <button
            type="button"
            onClick={() => switchTab('PAPER_SERVICES')}
            className={`rounded-md px-4 py-1.5 font-medium ${activeTab === 'PAPER_SERVICES' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            🖶 مطبوعات ورقية وخدمات
          </button>
          <button
            type="button"
            onClick={() => switchTab('NCR')}
            className={`rounded-md px-4 py-1.5 font-medium ${activeTab === 'NCR' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            📑 دفاتر مكررة (NCR)
          </button>
        </div>

        <div className="border-border bg-card space-y-4 rounded-2xl border p-4">
          {itemError && <div className="text-destructive text-sm">{itemError}</div>}

          {activeTab === 'PAPER_SERVICES' && (
            <label className="block max-w-xs space-y-1 text-sm">
              <span className="text-muted-foreground">نوع البند</span>
              <select
                value={draft.kind}
                onChange={(e) => setDraft(emptyDraftItem(e.target.value as PricingKind))}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              >
                {PAPER_AND_SERVICES_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          )}

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
                  {services.map((s) => (
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
    </div>
  );
}
