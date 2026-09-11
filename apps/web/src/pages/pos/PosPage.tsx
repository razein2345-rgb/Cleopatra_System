import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import type {
  BoardsCatalogItem,
  BranchSummary,
  BusinessPartner,
  CreateOrderInput,
  CreateOrderItemInput,
  InventoryItem,
  Order,
  OrderTemplate,
  PaymentMethod,
  ProductionTrack,
  ReadyProduct,
  Service,
} from '@cleopatra/shared';
import { resolveProductionTrackForTab } from '@cleopatra/shared';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/state/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PartnerCombobox, InventoryItemCombobox } from '@/components/cleopatra';
import { PAYMENT_METHOD_OPTIONS } from '@/pages/partners/partnerLabels';

/**
 * POS / Cashier (2026-09-11, owner-approved plan) — a fast, barcode-first
 * sale screen built entirely on top of existing architecture:
 * - Checkout reuses `POST /api/orders` (createOrder) as-is, unchanged.
 * - Catalog reuses the existing `/api/ready-products`, `/api/services`,
 *   `/api/boards-catalog-items`, `/api/inventory-items` endpoints.
 * - Barcode reuses the existing `/api/inventory-items/by-barcode/:barcode`.
 * - Price override reuses the existing `unitPriceOverride` pricing field
 *   (packages/shared/src/schemas/orderItemPricing.ts) — no new Backend logic.
 * - Walk-in customer is the one genuinely new piece: `POST /api/pos/walk-in-partner`
 *   (see apps/api/src/services/posService.ts), used only when a "بيع مباشر"
 *   sale needs a partner (Service/Product/Boards lines) and no real customer
 *   was chosen — `assertPartnerPresentUnlessWalkIn` itself is untouched.
 */

type CatalogKind = 'INVENTORY' | 'PRODUCT' | 'SERVICE' | 'BOARDS';

type CartLine = {
  key: string;
  kind: CatalogKind;
  catalogId: string;
  name: string;
  defaultUnitPrice: number;
  salePrice: number;
  quantity: number;
  discountPercent: number;
  availableQty?: number;
  productionTrack: ProductionTrack | null;
};

const CATALOG_ICON: Record<CatalogKind, string> = {
  INVENTORY: '📦',
  PRODUCT: '🛍️',
  SERVICE: '🛠️',
  BOARDS: '🪧',
};

const CATALOG_LABEL: Record<CatalogKind, string> = {
  INVENTORY: 'بضاعة من المخزون',
  PRODUCT: 'منتجات جاهزة',
  SERVICE: 'خدمات',
  BOARDS: 'لوحات وإعلانات',
};

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function lineTotal(line: CartLine): number {
  return line.salePrice * line.quantity * (1 - line.discountPercent / 100);
}

/**
 * Every non-BOARDS kind supports overriding the sale price
 * (`unitPriceOverride`, already in the schema) — BOARDS catalog items only
 * ever price off `catalogItem.price` server-side (see
 * `pricingEngineService.ts`'s BOARDS/boardsCatalogItemId case), so there is
 * no override field to send for them yet. Not invented here — Sale Price
 * stays fixed/read-only for BOARDS lines instead.
 */
function supportsPriceOverride(kind: CatalogKind): boolean {
  return kind !== 'BOARDS';
}

type CollapsibleSection = 'PRODUCT' | 'SERVICE' | 'TEMPLATES';

const SECTION_VISIBILITY_STORAGE_KEY = 'pos.sectionVisibility';

/**
 * Owner (2026-09-12, "عايز جمب خدمات ومنتجات جاهزة وقوالب عين... تظهر لو
 * فاتح العين وتختفي لو قافلها") — per-cashier convenience only (which
 * catalog sections are collapsed), kept in `localStorage` same as
 * `useColumnLayout`'s own precedent elsewhere in the app. Never sent to the
 * server — purely a display preference, defaults to all three open.
 */
function loadSectionVisibility(): Record<CollapsibleSection, boolean> {
  const defaults: Record<CollapsibleSection, boolean> = { PRODUCT: true, SERVICE: true, TEMPLATES: true };
  try {
    const raw = localStorage.getItem(SECTION_VISIBILITY_STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<Record<CollapsibleSection, boolean>>) };
  } catch {
    return defaults;
  }
}

function EyeToggleButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={visible ? 'إخفاء القسم' : 'إظهار القسم'}
      className="text-muted-foreground hover:text-foreground"
    >
      {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </button>
  );
}

export function PosPage() {
  const { authContext } = useAuth();
  const user = authContext!.user;
  const navigate = useNavigate();

  const [sectionVisibility, setSectionVisibility] = useState(loadSectionVisibility);
  useEffect(() => {
    try {
      localStorage.setItem(SECTION_VISIBILITY_STORAGE_KEY, JSON.stringify(sectionVisibility));
    } catch {
      // Best-effort only — a private/full storage just means the toggle doesn't persist across reloads.
    }
  }, [sectionVisibility]);
  function toggleSection(section: CollapsibleSection) {
    setSectionVisibility((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [branchId, setBranchId] = useState(user.branchId);
  const multiBranch = user.accessibleBranchIds.length > 1;

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [readyProducts, setReadyProducts] = useState<ReadyProduct[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [boardsCatalogItems, setBoardsCatalogItems] = useState<BoardsCatalogItem[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [templates, setTemplates] = useState<OrderTemplate[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [partnerId, setPartnerId] = useState('');
  // Owner (2026-09-12, "تكون Over view تحت وفي نفس الوقت اقدر اتعامل في
  // الصفحة بتاعت الكاشير... مش لما تظهر تعمل عزل") — a non-blocking bottom
  // panel, expanded by default (it's an overview, not something to go
  // looking for); the toggle only collapses it to reclaim screen space,
  // never gates whether the cashier can see it at all.
  const [showMobileCart, setShowMobileCart] = useState(true);

  const [barcodeValue, setBarcodeValue] = useState('');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [payments, setPayments] = useState<{ method: PaymentMethod; amount: string }[]>([{ method: 'CASH', amount: '' }]);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'DIRECT' | 'INVOICE' | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [successOrderType, setSuccessOrderType] = useState<'DIRECT' | 'INVOICE' | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const requests: [
          Promise<InventoryItem[]>,
          Promise<ReadyProduct[]>,
          Promise<Service[]>,
          Promise<BoardsCatalogItem[]>,
          Promise<BusinessPartner[]>,
          Promise<OrderTemplate[]>,
        ] = [
          apiGet<InventoryItem[]>('/api/inventory-items'),
          apiGet<ReadyProduct[]>('/api/ready-products'),
          apiGet<Service[]>('/api/services'),
          apiGet<BoardsCatalogItem[]>('/api/boards-catalog-items'),
          apiGet<BusinessPartner[]>('/api/partners'),
          // Owner (2026-09-11, "عايز الطلبات اللي بتتحفظ كقالب تظهرلي في
          // صفحة الكاشير") — the exact same `/api/order-templates` list
          // `/orders/new`'s "تحميل من قالب" picker already uses; POS just
          // renders it as another pick-to-add source (see applyTemplate).
          apiGet<OrderTemplate[]>('/api/order-templates'),
        ];
        const [inv, rp, sv, bc, pt, tpl] = await Promise.all(requests);
        if (!active) return;
        setInventoryItems(inv);
        setReadyProducts(rp);
        setServices(sv);
        setBoardsCatalogItems(bc);
        setPartners(pt);
        setTemplates(tpl);
        if (multiBranch) setBranches(await apiGet<BranchSummary[]>('/api/branches'));
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'تعذر تحميل الكتالوج');
      } finally {
        if (active) setLoadingCatalog(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  function addOrIncrement(entry: Omit<CartLine, 'key' | 'quantity' | 'salePrice' | 'discountPercent'>, qty = 1) {
    setCart((prev) => {
      const existing = prev.find((l) => l.kind === entry.kind && l.catalogId === entry.catalogId);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + qty } : l));
      }
      return [
        ...prev,
        { ...entry, key: `${entry.kind}:${entry.catalogId}:${Date.now()}`, quantity: qty, salePrice: entry.defaultUnitPrice, discountPercent: 0 },
      ];
    });
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleBarcodeSubmit() {
    const code = barcodeValue.trim();
    setBarcodeValue('');
    if (!code) return;
    try {
      const item = await apiGet<InventoryItem>(`/api/inventory-items/by-barcode/${encodeURIComponent(code)}`);
      setBarcodeError(null);
      addOrIncrement({
        kind: 'INVENTORY',
        catalogId: item.id,
        name: item.name,
        defaultUnitPrice: item.salePrice ?? 0,
        availableQty: item.quantityOnHand,
        productionTrack: null,
      });
    } catch (err) {
      setBarcodeError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      barcodeRef.current?.focus();
    }
  }

  const cartTotal = useMemo(() => cart.reduce((sum, l) => sum + lineTotal(l), 0), [cart]);
  const paymentsTotal = useMemo(() => payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0), [payments]);

  const filteredReadyProducts = useMemo(() => readyProducts.filter((p) => p.name.includes(search)), [readyProducts, search]);
  const filteredServices = useMemo(() => services.filter((s) => s.name.includes(search)), [services, search]);
  const filteredBoards = useMemo(() => boardsCatalogItems.filter((b) => b.name.includes(search)), [boardsCatalogItems, search]);

  /**
   * Owner (2026-09-12, "عايز الأصناف أول ما اكتبها تظهرلي... مش لازم
   * اسكرول") — typing in the catalog search used to only filter the
   * sections further down the page (still behind a scroll to actually see
   * them). This surfaces the same matches as an instant dropdown right
   * under the search box instead — same "type → see it immediately" feel
   * the barcode/inventory-search fields already have, just for the
   * catalog. The full sections below are untouched for plain browsing.
   */
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    return [
      ...filteredReadyProducts.map((p) => ({ key: `PRODUCT:${p.id}`, icon: CATALOG_ICON.PRODUCT, name: p.name, price: p.price, onAdd: () => addReadyProductToCart(p) })),
      ...filteredServices.map((s) => ({ key: `SERVICE:${s.id}`, icon: CATALOG_ICON.SERVICE, name: s.name, price: s.price, onAdd: () => addServiceToCart(s) })),
      ...filteredBoards.map((b) => ({ key: `BOARDS:${b.id}`, icon: CATALOG_ICON.BOARDS, name: b.name, price: b.price, onAdd: () => addBoardsItemToCart(b) })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filteredReadyProducts, filteredServices, filteredBoards]);

  function resolveReadyProductTrack(product: ReadyProduct): ProductionTrack | null {
    // Same routing NewOrderPage's "منتجات جاهزة" tab already uses (owner,
    // CLAUDE.md §12.4) — never re-derived differently here.
    if (product.sourceType === 'INTERNAL_PRODUCTION') return 'OTHER_PRODUCTS';
    return resolveProductionTrackForTab('READY_PRODUCTS');
  }

  // Named once and reused by both the full catalog grid (CatalogSection)
  // and the instant search dropdown below — same add-to-cart behavior
  // either way, just two different ways of finding the item.
  function addReadyProductToCart(p: ReadyProduct) {
    addOrIncrement({ kind: 'PRODUCT', catalogId: p.id, name: p.name, defaultUnitPrice: p.price, productionTrack: resolveReadyProductTrack(p) });
  }
  function addServiceToCart(s: Service) {
    addOrIncrement({ kind: 'SERVICE', catalogId: s.id, name: s.name, defaultUnitPrice: s.price, productionTrack: resolveProductionTrackForTab('SERVICES') });
  }
  function addBoardsItemToCart(b: BoardsCatalogItem) {
    addOrIncrement({ kind: 'BOARDS', catalogId: b.id, name: b.name, defaultUnitPrice: b.price, productionTrack: resolveProductionTrackForTab('BOARDS_SIGNAGE') });
  }

  /**
   * Owner (2026-09-11, "عايز الطلبات اللي بتتحفظ كقالب تظهرلي في صفحة
   * الكاشير") — `OrderTemplate.itemsSnapshot` is already exactly
   * `CreateOrderItemInput[]` (see orderTemplate.ts's own schema comment:
   * "reuses createOrderItemSchema verbatim... no separate/duplicated
   * item-shape"), the same shape `buildOrderItems` below produces. Rather
   * than freezing the template's own old price, each line is re-resolved
   * against POS's live catalog (same discipline as NewOrderPage's own
   * "pricing is never stored/reused as-is" rule) — so an item whose
   * catalog price changed since the template was saved always sells at
   * today's price, and quantity/discount stay freely editable in the cart
   * exactly like any other POS line.
   *
   * A template can also hold complex production-composer lines (LOOSE_PAPER/
   * NOTEBOOK/FOLDER/ENVELOPE/DIGITAL/MANUAL) that need fields (size, paper,
   * color count...) POS's fast catalog-card model was never built to edit —
   * those stay out of scope for the cashier screen (they belong in
   * `/orders/new`) and are skipped with a clear notice, never guessed at.
   */
  function applyTemplate(template: OrderTemplate) {
    let addedCount = 0;
    let skippedCount = 0;
    for (const item of template.itemsSnapshot) {
      const { pricing } = item;
      if (pricing.kind === 'INVENTORY_RETAIL') {
        const found = inventoryItems.find((i) => i.id === pricing.inventoryItemId);
        if (found) {
          addOrIncrement(
            { kind: 'INVENTORY', catalogId: found.id, name: found.name, defaultUnitPrice: found.salePrice ?? 0, availableQty: found.quantityOnHand, productionTrack: null },
            pricing.quantity,
          );
          addedCount++;
          continue;
        }
      } else if (pricing.kind === 'PRODUCT' && item.readyProductId) {
        const found = readyProducts.find((p) => p.id === item.readyProductId);
        if (found) {
          addOrIncrement({ kind: 'PRODUCT', catalogId: found.id, name: found.name, defaultUnitPrice: found.price, productionTrack: resolveReadyProductTrack(found) }, pricing.quantity);
          addedCount++;
          continue;
        }
      } else if (pricing.kind === 'SERVICE' && item.serviceId) {
        const found = services.find((s) => s.id === item.serviceId);
        if (found) {
          addOrIncrement(
            { kind: 'SERVICE', catalogId: found.id, name: found.name, defaultUnitPrice: found.price, productionTrack: resolveProductionTrackForTab('SERVICES') },
            pricing.quantity,
          );
          addedCount++;
          continue;
        }
      } else if (pricing.kind === 'BOARDS' && item.boardsCatalogItemId) {
        const found = boardsCatalogItems.find((b) => b.id === item.boardsCatalogItemId);
        if (found) {
          addOrIncrement(
            { kind: 'BOARDS', catalogId: found.id, name: found.name, defaultUnitPrice: found.price, productionTrack: resolveProductionTrackForTab('BOARDS_SIGNAGE') },
            pricing.quantity,
          );
          addedCount++;
          continue;
        }
      }
      skippedCount++;
    }
    setTemplateNotice(
      skippedCount === 0
        ? `تمت إضافة ${addedCount} صنف من قالب "${template.name}".`
        : `تمت إضافة ${addedCount} صنف من قالب "${template.name}" — تم تجاهل ${skippedCount} صنف (نوع إنتاج معقّد أو صنف لم يعد موجودًا بالكتالوج) لا تدعمه شاشة الكاشير، استخدم "فاتورة جديدة" له.`,
    );
  }

  function buildOrderItems(): CreateOrderItemInput[] {
    return cart.map((line): CreateOrderItemInput => {
      const override = supportsPriceOverride(line.kind) && line.salePrice !== line.defaultUnitPrice ? line.salePrice : undefined;
      const discountPercent = line.discountPercent > 0 ? line.discountPercent : undefined;
      if (line.kind === 'INVENTORY') {
        return {
          itemType: line.name,
          // `validateQuotationItemRefs` (quotationService.ts) rejects any
          // item with none of readyProductId/serviceId/boardsCatalogItemId
          // unless it carries a description — INVENTORY_RETAIL always hits
          // that (it prices off `pricing.inventoryItemId` instead). Same
          // fallback NewOrderPage.tsx's own cart-to-payload mapping already
          // uses for this exact case (line.description ?? ... : line.itemType).
          description: line.name,
          pricing: { kind: 'INVENTORY_RETAIL', inventoryItemId: line.catalogId, quantity: line.quantity, ...(override !== undefined ? { unitPriceOverride: override } : {}) },
          productionTrack: null,
          discountPercent,
        };
      }
      if (line.kind === 'PRODUCT') {
        return {
          itemType: line.name,
          readyProductId: line.catalogId,
          pricing: { kind: 'PRODUCT', quantity: line.quantity, ...(override !== undefined ? { unitPriceOverride: override } : {}) },
          productionTrack: line.productionTrack,
          discountPercent,
        };
      }
      if (line.kind === 'SERVICE') {
        return {
          itemType: line.name,
          serviceId: line.catalogId,
          pricing: { kind: 'SERVICE', quantity: line.quantity, ...(override !== undefined ? { unitPriceOverride: override } : {}) },
          productionTrack: line.productionTrack,
          discountPercent,
        };
      }
      return {
        itemType: line.name,
        boardsCatalogItemId: line.catalogId,
        pricing: { kind: 'BOARDS', quantity: line.quantity },
        productionTrack: line.productionTrack,
        discountPercent,
      };
    });
  }

  function resetForNextSale() {
    setCart([]);
    setPartnerId('');
    setPayments([{ method: 'CASH', amount: '' }]);
    setCheckoutError(null);
    barcodeRef.current?.focus();
  }

  async function handleCheckout(type: 'DIRECT' | 'INVOICE') {
    setCheckoutError(null);
    if (cart.length === 0) {
      setCheckoutError('السلة فارغة — أضف صنفًا واحدًا على الأقل قبل إتمام البيع.');
      return;
    }
    if (type === 'INVOICE' && !partnerId) {
      setCheckoutError('اختر عميلاً لإصدار الفاتورة باسمه.');
      return;
    }
    const validPayments = payments.filter((p) => (Number(p.amount) || 0) > 0).map((p) => ({ method: p.method, amount: Number(p.amount) }));
    if (type === 'DIRECT' && validPayments.length === 0) {
      setCheckoutError('أدخل مبلغ التحصيل قبل إتمام البيع المباشر.');
      return;
    }

    setSubmitting(type);
    try {
      let effectivePartnerId: string | null = partnerId || null;
      // Owner decision (2026-09-11): `WALK_IN_ALLOWED_KINDS`/
      // `assertPartnerPresentUnlessWalkIn` in orderService.ts stay untouched
      // — a cart made only of INVENTORY_RETAIL lines already qualifies for
      // a null partner today, exactly like `/orders/new`. The shared
      // "عميل نقدي" is only fetched when the cart actually needs a partner
      // (a Service/Product/Boards line present) and none was chosen.
      const needsPartner = cart.some((l) => l.kind !== 'INVENTORY');
      if (type === 'DIRECT' && !effectivePartnerId && needsPartner) {
        const walkIn = await apiPost<BusinessPartner>('/api/pos/walk-in-partner', { branchId });
        effectivePartnerId = walkIn.id;
      }

      const payload: CreateOrderInput = {
        partnerId: effectivePartnerId,
        branchId,
        items: buildOrderItems(),
        ...(validPayments.length > 0 ? { payments: validPayments } : {}),
      };
      const order = await apiPost<Order>('/api/orders', payload);
      setSuccessOrder(order);
      setSuccessOrderType(type);
      setCart([]);
      setPartnerId('');
      setPayments([{ method: 'CASH', amount: '' }]);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'تعذر إتمام البيع، حاول مرة أخرى.');
    } finally {
      setSubmitting(null);
    }
  }

  if (successOrder) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="space-y-4 pt-6">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-bold">تم البيع بنجاح</h2>
            <p className="text-muted-foreground text-sm">رقم الفاتورة</p>
            <p className="text-2xl font-bold" dir="ltr">
              {successOrder.invoiceNumber}
            </p>
            <p className="text-muted-foreground text-sm">الإجمالي</p>
            <p className="text-lg font-semibold" dir="ltr">
              {money(successOrder.finalTotal)} ج.م
            </p>
            {/* Owner (2026-09-12, "لو عملت فاتورة يبقى عايز اطبعا اكيد") —
                only for "إصدار فاتورة" (a real customer document); "بيع
                مباشر" stays receipt-less per the original POS scope. Same
                printable invoice view/print button `/orders/new`'s own
                success screen already navigates to — zero new print logic. */}
            {successOrderType === 'INVOICE' && (
              <Button className="w-full" variant="secondary" onClick={() => navigate(`/orders/${successOrder.id}`)}>
                🖶 طباعة الفاتورة
              </Button>
            )}
            <Button className="w-full" onClick={() => { setSuccessOrder(null); setSuccessOrderType(null); }}>
              بيع جديد
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Cart + payment + checkout — rendered once, reused as both the desktop
  // sticky sidebar and the mobile bottom-sheet overlay content below.
  const cartPanel = (
    <>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-bold">السلة ({cart.length})</h3>
          {cart.length === 0 && <p className="text-muted-foreground text-sm">امسح باركود أو اضغط على صنف لإضافته.</p>}
          <div className="max-h-[45vh] space-y-2 overflow-y-auto">
            {cart.map((line) => (
              <CartLineRow key={line.key} line={line} onChange={(patch) => updateLine(line.key, patch)} onRemove={() => removeLine(line.key)} />
            ))}
          </div>
          <div className="flex items-center justify-between border-t pt-3 text-lg font-bold">
            <span>الإجمالي</span>
            <span dir="ltr">{money(cartTotal)} ج.م</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <h3 className="font-bold">التحصيل</h3>
          {payments.map((p, i) => (
            <div key={i} className="flex gap-2">
              <select
                value={p.method}
                onChange={(e) => setPayments((prev) => prev.map((x, xi) => (xi === i ? { ...x, method: e.target.value as PaymentMethod } : x)))}
                className="border-input bg-background rounded-md border px-2 py-2 text-sm"
              >
                {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                value={p.amount}
                onChange={(e) => setPayments((prev) => prev.map((x, xi) => (xi === i ? { ...x, amount: e.target.value } : x)))}
                // Owner (2026-09-12, "لو دوست Enter بعد تسجيل الأصناف
                // يبقى تم البيع") — once the cashier finishes scanning/
                // adding items and types the amount received, Enter here
                // completes the same "بيع مباشر" the button does; no new
                // checkout path, just another trigger for the existing one.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCheckout('DIRECT');
                  }
                }}
                placeholder="0.00"
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                dir="ltr"
              />
              {payments.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPayments((prev) => prev.filter((_, xi) => xi !== i))}>
                  ✕
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => setPayments((prev) => [...prev, { method: 'CASH', amount: '' }])}>
            + طريقة دفع أخرى
          </Button>
          <p className="text-muted-foreground text-xs">إجمالي المحصّل: {money(paymentsTotal)} ج.م</p>
        </CardContent>
      </Card>

      {checkoutError && <p className="text-destructive text-sm font-medium">{checkoutError}</p>}

      <div className="grid grid-cols-1 gap-2">
        <Button size="lg" disabled={submitting !== null} onClick={() => void handleCheckout('DIRECT')}>
          {submitting === 'DIRECT' ? 'جارٍ البيع…' : 'بيع مباشر'}
        </Button>
        <Button size="lg" variant="outline" disabled={submitting !== null} onClick={() => void handleCheckout('INVOICE')}>
          {submitting === 'INVOICE' ? 'جارٍ إصدار الفاتورة…' : 'إصدار فاتورة'}
        </Button>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" onClick={resetForNextSale} disabled={submitting !== null}>
            تفريغ السلة
          </Button>
        )}
      </div>
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-4 p-4 pb-[55vh] lg:grid-cols-[1fr_380px] lg:pb-4">
      <div className="space-y-4">
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 pt-6 sm:grid-cols-2">
            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">مسح الباركود</span>
              <input
                ref={barcodeRef}
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleBarcodeSubmit();
                  }
                }}
                placeholder="امسح الباركود أو اكتبه واضغط Enter"
                autoFocus
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-lg"
              />
              {barcodeError && <p className="text-destructive text-sm">{barcodeError}</p>}
            </label>

            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">بحث في المخزون (بدون باركود)</span>
              <InventoryItemCombobox
                items={inventoryItems}
                value=""
                onChange={(item) =>
                  addOrIncrement({
                    kind: 'INVENTORY',
                    catalogId: item.id,
                    name: item.name,
                    defaultUnitPrice: item.salePrice ?? 0,
                    availableQty: item.quantityOnHand,
                    productionTrack: null,
                  })
                }
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">العميل (اختياري للبيع المباشر)</span>
              <PartnerCombobox partners={partners} value={partnerId} onChange={setPartnerId} placeholder="— عميل نقدي —" />
            </label>

            {multiBranch && (
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">الفرع</span>
                <select
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
            )}

            <label className="relative block space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">بحث في الكتالوج (منتجات جاهزة / خدمات / لوحات)</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="اكتب اسم الصنف أو الخدمة…"
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
              {/* Owner (2026-09-12, "عايز الأصناف أول ما اكتبها تظهرلي...
                  مش لازم اسكرول") — instant results right under the box,
                  same "type → see it now" feel as the barcode/inventory
                  fields, instead of only filtering the sections scrolled
                  further down the page. */}
              {search.trim() && (
                <div className="bg-popover absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md border shadow-md">
                  {searchResults.length === 0 ? (
                    <p className="text-muted-foreground p-3 text-sm">لا يوجد صنف مطابق</p>
                  ) : (
                    searchResults.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => {
                          r.onAdd();
                          setSearch('');
                        }}
                        className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm"
                      >
                        <span>
                          {r.icon} {r.name}
                        </span>
                        <span className="text-muted-foreground" dir="ltr">
                          {money(r.price)} ج
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </label>
          </CardContent>
        </Card>

        {loadError && <p className="text-destructive text-sm">{loadError}</p>}
        {loadingCatalog && <p className="text-muted-foreground text-sm">جارٍ تحميل الكتالوج…</p>}
        {templateNotice && <p className="text-muted-foreground text-sm">{templateNotice}</p>}

        {templates.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold">📁 القوالب المحفوظة</h3>
                <EyeToggleButton visible={sectionVisibility.TEMPLATES} onToggle={() => toggleSection('TEMPLATES')} />
              </div>
              {sectionVisibility.TEMPLATES && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="hover:bg-accent flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors"
                  >
                    <span className="text-2xl">📁</span>
                    <span className="line-clamp-2 text-sm font-medium">{t.name}</span>
                    <span className="text-muted-foreground text-xs">{t.itemsSnapshot.length} صنف</span>
                  </button>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        )}

        <CatalogSection
          icon={CATALOG_ICON.PRODUCT}
          label={CATALOG_LABEL.PRODUCT}
          items={filteredReadyProducts}
          getPrice={(p) => p.price}
          onAdd={addReadyProductToCart}
          visible={sectionVisibility.PRODUCT}
          onToggleVisible={() => toggleSection('PRODUCT')}
        />
        <CatalogSection
          icon={CATALOG_ICON.SERVICE}
          label={CATALOG_LABEL.SERVICE}
          items={filteredServices}
          getPrice={(s) => s.price}
          onAdd={addServiceToCart}
          visible={sectionVisibility.SERVICE}
          onToggleVisible={() => toggleSection('SERVICE')}
        />
        <CatalogSection
          icon={CATALOG_ICON.BOARDS}
          label={CATALOG_LABEL.BOARDS}
          items={filteredBoards}
          getPrice={(b) => b.price}
          onAdd={addBoardsItemToCart}
        />
      </div>

      {/* Desktop: permanent sticky side view, exactly as before. */}
      <div className="hidden space-y-3 lg:sticky lg:top-4 lg:block lg:self-start">{cartPanel}</div>

      {/* Owner (2026-09-12): "تكون Over view تحت وفي نفس الوقت اقدر
          اتعامل في الصفحة بتاعت الكاشير... مش لما تظهر تعمل عزل... اقدر
          اسكرول واطلب من الصفحة وهي ظاهرالي" — a docked bottom panel, NOT
          a modal: no backdrop, no click-to-dismiss, nothing blocks the
          catalog above it. It only occupies its own fixed strip at the
          bottom of the screen — the rest of the page keeps scrolling and
          every card stays clickable, exactly like the desktop side view
          just at the bottom instead of the side. The collapse toggle is
          just to reclaim screen space when the cashier wants it, not a
          show/hide gate — it starts open. */}
      <div className="bg-card fixed inset-x-0 bottom-0 z-20 border-t shadow-lg lg:hidden">
        <button
          type="button"
          onClick={() => setShowMobileCart((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-bold"
        >
          <span>🛒 السلة ({cart.length})</span>
          <span className="flex items-center gap-2">
            <span dir="ltr">{money(cartTotal)} ج.م</span>
            <span>{showMobileCart ? '▾' : '▴'}</span>
          </span>
        </button>
        {showMobileCart && <div className="max-h-[50vh] space-y-3 overflow-y-auto border-t p-3">{cartPanel}</div>}
      </div>
    </div>
  );
}

function CatalogSection<T extends { id: string; name: string }>({
  icon,
  label,
  items,
  getPrice,
  onAdd,
  visible = true,
  onToggleVisible,
}: {
  icon: string;
  label: string;
  items: T[];
  getPrice: (item: T) => number;
  onAdd: (item: T) => void;
  // Owner (2026-09-12) asked for the show/hide eye specifically on
  // Services/ReadyProducts/Templates — optional here so BOARDS (not
  // requested) keeps rendering exactly as before, with no toggle at all.
  visible?: boolean;
  onToggleVisible?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">
            {icon} {label}
          </h3>
          {onToggleVisible && <EyeToggleButton visible={visible} onToggle={onToggleVisible} />}
        </div>
        {visible && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAdd(item)}
                className="hover:bg-accent flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors"
              >
                <span className="text-2xl">{icon}</span>
                <span className="line-clamp-2 text-sm font-medium">{item.name}</span>
                <span className="text-muted-foreground text-xs" dir="ltr">
                  {money(getPrice(item))} ج.م
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CartLineRow({ line, onChange, onRemove }: { line: CartLine; onChange: (patch: Partial<CartLine>) => void; onRemove: () => void }) {
  const overPriced = line.availableQty !== undefined && line.quantity > line.availableQty;
  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {CATALOG_ICON[line.kind]} {line.name}
          </p>
          <Badge variant="outline" className="mt-1">
            {CATALOG_LABEL[line.kind]}
          </Badge>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          حذف
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ quantity: Math.max(1, line.quantity - 1) })}>
          −
        </Button>
        <span className="w-8 text-center" dir="ltr">
          {line.quantity}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ quantity: line.quantity + 1 })}>
          +
        </Button>

        {supportsPriceOverride(line.kind) ? (
          <label className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">سعر البيع</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={line.salePrice}
              onChange={(e) => onChange({ salePrice: Number(e.target.value) || 0 })}
              className="border-input bg-background w-20 rounded-md border px-1.5 py-1 text-xs"
              dir="ltr"
            />
          </label>
        ) : (
          <span className="text-muted-foreground text-xs" dir="ltr">
            {money(line.salePrice)} ج.م
          </span>
        )}

        <label className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">خصم%</span>
          <input
            type="number"
            min={0}
            max={100}
            step="1"
            value={line.discountPercent || ''}
            onChange={(e) => onChange({ discountPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
            className="border-input bg-background w-14 rounded-md border px-1.5 py-1 text-xs"
            dir="ltr"
          />
        </label>
      </div>

      {line.defaultUnitPrice !== line.salePrice && (
        <p className="text-muted-foreground text-xs">
          السعر الافتراضي: <span dir="ltr">{money(line.defaultUnitPrice)}</span> ج.م
        </p>
      )}
      {overPriced && (
        <p className="text-destructive text-xs">
          الكمية المطلوبة ({line.quantity}) أكبر من المتاح ({line.availableQty}) — البيع مسموح لكن تحقق من المخزون.
        </p>
      )}

      <div className="text-left text-sm font-semibold" dir="ltr">
        {money(lineTotal(line))} ج.م
      </div>
    </div>
  );
}
