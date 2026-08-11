import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  BoardMaterial,
  BranchSummary,
  BusinessPartner,
  CreateOrderInput,
  CreateQuotationInput,
  InventoryItem,
  Order,
  OrderItemPricingInput,
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
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
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
const KIND_OPTIONS = Object.keys(KIND_LABELS) as PricingKind[];

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
}

let draftKeySeq = 0;
function emptyDraftItem(): DraftItem {
  draftKeySeq += 1;
  return {
    key: `item-${draftKeySeq}`,
    kind: 'LOOSE_PAPER',
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
  };
}

const toNum = (v: string): number => (v.trim() === '' ? 0 : Number(v));
const toOptionalNum = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));

/** Narrows a `DraftItem` into a real `OrderItemPricingInput` — returns null while required fields for that kind aren't filled in yet (not an error, just "not priceable yet"). */
function buildPricingInput(d: DraftItem): OrderItemPricingInput | null {
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
      };
    case 'ENVELOPE':
      if (!d.quantity || !d.colorCount) return null;
      return {
        kind: 'ENVELOPE',
        quantity: toNum(d.quantity),
        colorCount: toNum(d.colorCount),
        isNewDesign: d.isNewDesign,
        readyEnvelopePricePerPiece: toNum(d.readyEnvelopePricePerPiece),
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
      };
    case 'PRODUCT':
    case 'SERVICE':
      if (!d.quantity) return null;
      return { kind: d.kind, quantity: toNum(d.quantity) };
  }
}

interface PricingCtx {
  families: PricingReference['sizeFamilies'];
  pricingConstants: PricingReference['pricingConstants'];
  boardsConstants: PricingReference['boardsConstants'];
  sheetPriceByInventoryItemId: Map<string, number>;
  catalogPriceById: Map<string, number>;
}

/** Client-side mirror of `orderService.ts`'s `computeItemPricing` dispatch — same pure functions, used only for the live preview; the server always recomputes authoritatively on submit. */
function previewItemTotal(d: DraftItem, ctx: PricingCtx): { total: number; error: string | null } {
  const pricing = buildPricingInput(d);
  if (!pricing) return { total: 0, error: null };

  const families = ctx.families.map((f) => ({
    key: f.key,
    base: f.base,
    entries: f.entries.map((e) => ({ label: e.label, piecesPerSheet: e.piecesPerSheet })),
  }));

  try {
    switch (pricing.kind) {
      case 'LOOSE_PAPER': {
        const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
        if (sheetPrice === undefined) return { total: 0, error: 'الصنف المختار غير مرتبط بسعر ورق' };
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
        });
        return { total: r.total, error: null };
      }
      case 'NOTEBOOK': {
        const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
        if (sheetPrice === undefined) return { total: 0, error: 'الصنف المختار غير مرتبط بسعر ورق' };
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
        });
        return { total: r.total, error: null };
      }
      case 'ENVELOPE': {
        const r = calculateEnvelopeCost({
          quantity: pricing.quantity,
          colorCount: pricing.colorCount,
          isNewDesign: pricing.isNewDesign,
          readyEnvelopePricePerPiece: pricing.readyEnvelopePricePerPiece,
          settings: ctx.pricingConstants,
        });
        return { total: r.total, error: null };
      }
      case 'FOLDER': {
        const sheetPrice = ctx.sheetPriceByInventoryItemId.get(pricing.inventoryItemId);
        if (sheetPrice === undefined) return { total: 0, error: 'الصنف المختار غير مرتبط بسعر ورق' };
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
        });
        return { total: r.total, error: null };
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
        });
        return { total: r.total, error: null };
      }
      case 'PRODUCT':
      case 'SERVICE': {
        const catalogId = d.readyProductId || d.serviceId;
        if (!catalogId) return { total: 0, error: null };
        const unitPrice = ctx.catalogPriceById.get(catalogId);
        if (unitPrice === undefined) return { total: 0, error: 'لا يوجد سعر لهذا الصنف' };
        return { total: calculateProductOrServiceCost(unitPrice, pricing.quantity), error: null };
      }
    }
  } catch (err) {
    return { total: 0, error: err instanceof Error ? err.message : 'تعذر حساب السعر' };
  }
}

/**
 * FEATURE-006 M2 / FEATURE-007 PE-E — Direct Order/Invoice creation, wired
 * to the real pricing engine. Each item is priced client-side for an
 * instant preview (PRICING_ENGINE_SPEC.md §5 — "كل الحسابات المالية تُحسب
 * لحظيًا في الواجهة") using the exact same pure functions
 * (`packages/shared/src/pricing/*`) the server runs authoritatively on
 * submit — never a client-computed total sent as-is (see
 * `orderItemPricing.ts`'s own doc comment).
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
        <p className="text-muted-foreground text-sm">
          الإجمالي: {order.finalTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
        </p>
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
        <p className="text-muted-foreground text-sm">
          الإجمالي: {quotation.finalTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/quotations')}>
            العودة إلى المستندات
          </Button>
          <Button type="button" onClick={() => navigate(`/quotations/${quotation.id}`)}>
            عرض التفاصيل
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
 * (FEATURE-007 WF-A, still pending) — until one exists this honestly
 * shows that instead of pretending the action is available.
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
        <Button type="button" size="sm" variant="secondary" onClick={() => navigate(`/work-orders/${created.id}`)}>
          طباعة أمر الشغل
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
  const [items, setItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const previews = useMemo(() => items.map((d) => previewItemTotal(d, ctx)), [items, ctx]);
  const subtotal = previews.reduce((sum, p) => sum + p.total, 0);
  const discountNum = toNum(discountPercent);
  const afterDiscount = subtotal * (1 - discountNum / 100);
  const vatAmount = vatOn ? afterDiscount * (pricingReference.vatRate / 100) : 0;
  const finalTotal = afterDiscount + vatAmount;

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const familyEntries = (familyKey: string): SizeFamily['entries'] =>
    pricingReference.sizeFamilies.find((f) => f.key === familyKey)?.entries ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const pricingInputs = items.map((d) => buildPricingInput(d));
    const missingIndex = pricingInputs.findIndex((p) => p === null);
    if (missingIndex !== -1) {
      setError(`البند رقم ${missingIndex + 1} غير مكتمل — أكمل بيانات التسعير الخاصة به`);
      return;
    }
    const errorIndex = previews.findIndex((p) => p.error);
    if (errorIndex !== -1) {
      setError(`البند رقم ${errorIndex + 1}: ${previews[errorIndex]!.error}`);
      return;
    }
    if (documentType === 'QUOTATION' && !validUntil) {
      setError('حدد تاريخ صلاحية عرض السعر');
      return;
    }

    // Same item shape either way — `createQuotationItemSchema` and
    // `createOrderItemSchema` are structurally identical (FEATURE-007,
    // one Pricing Engine for both), so only the wrapping document differs.
    const outputItems = items.map((item, index) => {
      const label = item.itemType || KIND_LABELS[item.kind];
      const hasCatalogRef = item.kind === 'PRODUCT' || item.kind === 'SERVICE';
      return {
        itemType: label,
        notes: item.notes || undefined,
        // `validateQuotationItemRefs` requires a description on any item
        // with no readyProductId/serviceId — reuse the same label the
        // user already typed (or the kind's default) rather than adding
        // a second, redundant free-text field to the form.
        description: hasCatalogRef ? undefined : label,
        readyProductId: item.kind === 'PRODUCT' ? item.readyProductId || undefined : undefined,
        serviceId: item.kind === 'SERVICE' ? item.serviceId || undefined : undefined,
        pricing: pricingInputs[index]!,
      };
    });

    setSubmitting(true);
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
        onCreated({ type: 'QUOTATION', quotation });
      } else {
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
        };
        const order = await apiPost<Order>('/api/orders', input);
        onCreated({ type: 'INVOICE', order });
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
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">الطلبات والمستندات</h1>
        <p className="text-muted-foreground text-sm">
          {documentType === 'QUOTATION'
            ? 'إنشاء عرض سعر جديد للعميل — يمكن تحويله لاحقًا إلى فاتورة عند الموافقة. التسعير يُحسب تلقائيًا لحظيًا.'
            : 'للعميل الذي يطلب الشغل مباشرة — يتم إنشاء الفاتورة فورًا دون المرور بعرض سعر. التسعير يُحسب تلقائيًا لحظيًا.'}
        </p>

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

        <div className="border-border bg-card space-y-4 rounded-2xl border p-4">
          {error && <div className="text-destructive text-sm">{error}</div>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">نسبة الخصم %</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 self-end text-sm">
              <input type="checkbox" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} />
              تطبيق ضريبة القيمة المضافة ({pricingReference.vatRate}%)
            </label>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">البنود</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => setItems((prev) => [...prev, emptyDraftItem()])}>
                + إضافة بند
              </Button>
            </div>

            {items.map((item, index) => {
              const preview = previews[index]!;
              const entries = familyEntries(item.sizeFamilyKey);
              const isSheetKind = item.kind === 'LOOSE_PAPER' || item.kind === 'NOTEBOOK' || item.kind === 'FOLDER';
              return (
                <div key={item.key} className="border-border space-y-3 rounded-xl border p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="text-muted-foreground">النوع</span>
                      <select
                        value={item.kind}
                        onChange={(e) => updateItem(index, { kind: e.target.value as PricingKind })}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      >
                        {KIND_OPTIONS.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="text-muted-foreground">وصف البند (يظهر على الفاتورة)</span>
                      <input
                        value={item.itemType}
                        onChange={(e) => updateItem(index, { itemType: e.target.value })}
                        placeholder={KIND_LABELS[item.kind]}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  {isSheetKind && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">مجموعة المقاس</span>
                        <select
                          value={item.sizeFamilyKey}
                          onChange={(e) => updateItem(index, { sizeFamilyKey: e.target.value, realSizeLabel: '' })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">— اختر —</option>
                          {pricingReference.sizeFamilies.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">المقاس الفعلي</span>
                        <select
                          value={item.realSizeLabel}
                          onChange={(e) => updateItem(index, { realSizeLabel: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">— اختر —</option>
                          {entries.map((en) => (
                            <option key={en.label} value={en.label}>
                              {en.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="text-muted-foreground">صنف الورق (للخصم من المخزون)</span>
                        <select
                          value={item.inventoryItemId}
                          onChange={(e) => updateItem(index, { inventoryItemId: e.target.value })}
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
                    </div>
                  )}

                  {isSheetKind && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">عدد الألوان</span>
                        <input
                          type="number"
                          min={1}
                          value={item.colorCount}
                          onChange={(e) => updateItem(index, { colorCount: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      {(item.kind === 'LOOSE_PAPER' || item.kind === 'FOLDER') && (
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">عدد الوجوه</span>
                          <select
                            value={item.sides}
                            onChange={(e) => updateItem(index, { sides: e.target.value as '1' | '2' })}
                            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                          >
                            <option value="1">وجه واحد</option>
                            <option value="2">وجهين</option>
                          </select>
                        </label>
                      )}
                      <label className="flex items-center gap-2 self-end text-sm">
                        <input type="checkbox" checked={item.isNewDesign} onChange={(e) => updateItem(index, { isNewDesign: e.target.checked })} />
                        تصميم جديد
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">بداية الترقيم (اختياري)</span>
                        <input
                          type="number"
                          min={1}
                          value={item.numberingStartNumber}
                          onChange={(e) => updateItem(index, { numberingStartNumber: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  )}

                  {item.kind === 'LOOSE_PAPER' && (
                    <label className="block max-w-xs space-y-1 text-sm">
                      <span className="text-muted-foreground">الكمية</span>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: e.target.value })}
                        className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                      />
                    </label>
                  )}

                  {item.kind === 'NOTEBOOK' && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">عدد الدفاتر</span>
                        <input
                          type="number"
                          min={1}
                          value={item.notebookQuantity}
                          onChange={(e) => updateItem(index, { notebookQuantity: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">المحتوى</span>
                        <select
                          value={item.contentType}
                          onChange={(e) => updateItem(index, { contentType: e.target.value as DraftItem['contentType'] })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="ORIGINAL_ONLY">أصل فقط</option>
                          <option value="ORIGINAL_PLUS_COPIES">أصل + كربون</option>
                        </select>
                      </label>
                      {item.contentType === 'ORIGINAL_PLUS_COPIES' && (
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">عدد نسخ الكربون</span>
                          <input
                            type="number"
                            min={1}
                            value={item.copies}
                            onChange={(e) => updateItem(index, { copies: e.target.value })}
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
                          value={item.bindingPricePerNotebook}
                          onChange={(e) => updateItem(index, { bindingPricePerNotebook: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  )}

                  {item.kind === 'ENVELOPE' && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">الكمية</span>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(index, { quantity: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">عدد الألوان</span>
                        <input
                          type="number"
                          min={1}
                          value={item.colorCount}
                          onChange={(e) => updateItem(index, { colorCount: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">سعر الظرف الجاهز/قطعة</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.readyEnvelopePricePerPiece}
                          onChange={(e) => updateItem(index, { readyEnvelopePricePerPiece: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-2 self-end text-sm">
                        <input type="checkbox" checked={item.isNewDesign} onChange={(e) => updateItem(index, { isNewDesign: e.target.checked })} />
                        تصميم جديد
                      </label>
                    </div>
                  )}

                  {item.kind === 'FOLDER' && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">الكمية</span>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(index, { quantity: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-2 self-end text-sm">
                        <input
                          type="checkbox"
                          checked={item.sellophaneEnabled}
                          onChange={(e) => updateItem(index, { sellophaneEnabled: e.target.checked })}
                        />
                        سلوفان
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">ريزا</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.riza}
                          onChange={(e) => updateItem(index, { riza: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">جراب داخلي</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.jarab}
                          onChange={(e) => updateItem(index, { jarab: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">فورمة</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.forma}
                          onChange={(e) => updateItem(index, { forma: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">تكسير وتلزيق</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.taksir}
                          onChange={(e) => updateItem(index, { taksir: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  )}

                  {item.kind === 'BOARDS' && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">الخامة</span>
                        <select
                          value={item.material}
                          onChange={(e) => updateItem(index, { material: e.target.value as BoardMaterial })}
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
                          value={item.widthCm}
                          onChange={(e) => updateItem(index, { widthCm: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">الارتفاع (سم)</span>
                        <input
                          type="number"
                          min={1}
                          value={item.heightCm}
                          onChange={(e) => updateItem(index, { heightCm: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">الكمية</span>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(index, { quantity: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                      {item.material === 'BANNER' && (
                        <label className="flex items-center gap-2 self-end text-sm">
                          <input type="checkbox" checked={item.hasDesign} onChange={(e) => updateItem(index, { hasDesign: e.target.checked })} />
                          تصميم
                        </label>
                      )}
                      {(item.material === 'VINYL_NORMAL' || item.material === 'VINYL_PRINT_CUT') && (
                        <label className="flex items-center gap-2 self-end text-sm">
                          <input
                            type="checkbox"
                            checked={item.hasSellophane}
                            onChange={(e) => updateItem(index, { hasSellophane: e.target.checked })}
                          />
                          سلوفان
                        </label>
                      )}
                    </div>
                  )}

                  {item.kind === 'PRODUCT' && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="text-muted-foreground">المنتج</span>
                        <select
                          value={item.readyProductId}
                          onChange={(e) => updateItem(index, { readyProductId: e.target.value })}
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
                          value={item.quantity}
                          onChange={(e) => updateItem(index, { quantity: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  )}

                  {item.kind === 'SERVICE' && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="text-muted-foreground">الخدمة</span>
                        <select
                          value={item.serviceId}
                          onChange={(e) => updateItem(index, { serviceId: e.target.value })}
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
                          value={item.quantity}
                          onChange={(e) => updateItem(index, { quantity: e.target.value })}
                          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  )}

                  <label className="block space-y-1 text-sm">
                    <span className="text-muted-foreground">ملاحظات على البند</span>
                    <input
                      value={item.notes}
                      onChange={(e) => updateItem(index, { notes: e.target.value })}
                      className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="flex items-center justify-between border-t pt-2">
                    <p className="text-sm font-medium">
                      سعر البند:{' '}
                      <span className={preview.error ? 'text-destructive' : 'text-foreground'}>
                        {preview.error ?? `${preview.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`}
                      </span>
                    </p>
                    {items.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)}>
                        حذف البند ✕
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'جارٍ الحفظ…' : documentType === 'QUOTATION' ? 'حفظ كعرض سعر' : 'إنشاء الفاتورة'}
          </Button>
        </div>
      </div>

      <aside className="border-border bg-card sticky top-4 h-fit space-y-3 rounded-2xl border p-4">
        <p className="text-sm font-bold">{documentType === 'QUOTATION' ? 'ملخص عرض السعر' : 'ملخص الفاتورة'}</p>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">الإجمالي قبل الخصم</span>
            <span>{subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">الخصم ({discountNum}%)</span>
            <span>-{(subtotal - afterDiscount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</span>
          </div>
          {vatOn && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">ضريبة القيمة المضافة ({pricingReference.vatRate}%)</span>
              <span>{vatAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</span>
            </div>
          )}
        </div>

        {/* The video's "live green box" — the final total, large and
            instantly recalculated on every keystroke, no separate confirm
            step. Cleopatra's own `--success` token, not the video's exact color. */}
        <div className="bg-success/15 flex flex-col items-center gap-1 rounded-xl p-4 text-center">
          <span className="text-success text-xs font-medium">الإجمالي النهائي</span>
          <span className="text-success text-3xl font-bold tabular-nums">
            {finalTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-success text-xs">جنيه مصري</span>
        </div>
      </aside>
    </form>
  );
}
