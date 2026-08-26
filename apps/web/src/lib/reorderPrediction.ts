import type { ItemReorderOverride, Order } from '@cleopatra/shared';

type OrderItem = Order['items'][number];

/**
 * FEATURE (2026-08-26, owner: "محتاج احط متوسط جمب كل صنف هو هيخلص امتى
 * علشان ابلغ العميل بالصنف الفلاني قرب يخلص") — same "last date + average
 * gap between past occurrences" heuristic `OrdersHistoryTab.tsx` already
 * uses at the whole-order level, applied per distinct item instead.
 * Shared between `ReorderPredictionTab.tsx` (per-customer tab) and the
 * dashboard's `ReorderDueWidget.tsx` (cross-customer widget) — one
 * grouping/prediction implementation, not two (rule 5, "دوّر قبل ما تبني").
 *
 * `OrderItem` has no stable catalog FK once frozen — `readyProductId`/
 * `serviceId` only ever exist on the create-order *input*, never persisted
 * as their own column on `OrderItem` (only `modelName`, a frozen name
 * snapshot, survives). So identity here is best-effort: prefer
 * `inventoryItemId` (a real, stable FK — covers paper items and
 * INVENTORY_RETAIL sales), then fall back to the frozen human label
 * (`modelName` for catalog PRODUCT/SERVICE items, or `kind` — the
 * free-text "اسم البند" the composer stamps every other kind with).
 */
export function itemIdentity(item: OrderItem): { key: string; label: string } | null {
  const label = item.modelName?.trim() || item.kind?.trim() || null;
  if (item.inventoryItemId) return { key: `inv:${item.inventoryItemId}`, label: label ?? 'صنف من المخزون' };
  if (label) return { key: `name:${label.toLowerCase()}`, label };
  return null;
}

/** `breakdown.quantity` is the one field every pricing kind freezes the customer-facing piece count under (see pricingEngineService.ts) — including NOTEBOOK, whose own `notebookQuantity` input is stored there under the same shared key. */
export function itemQuantity(item: OrderItem): number {
  const q = (item.breakdown as Record<string, unknown> | null)?.quantity;
  return typeof q === 'number' ? q : 1;
}

export interface ItemGroup {
  key: string;
  label: string;
  orderCount: number;
  totalQuantity: number;
  lastOrderDate: string;
  lastOrderId: string;
  lastInvoiceNumber: string;
  /** Quantity of just the most recent order — the base a manual daily-consumption-rate override projects forward from. */
  lastQuantity: number;
  avgGapDays: number | null;
  /** The plain average-gap heuristic's own date — a manual override (see resolveEffectiveDate) may replace this for display/notification purposes without touching this raw value. */
  predictedNext: Date | null;
}

/**
 * Owner (2026-08-26, "الوقت بيتحسب تقريبي بس ممكن اعدله يدوي" +
 * "أحسب مثلا هو بيسهلك كام قطعة في اليوم ... ولو قالي تقريباً بيخلص في
 * كذا فا اكتب التاريخ") — resolution order: a direct manual date wins,
 * then a manual daily-consumption-rate projection (last order's date +
 * its quantity ÷ the rate), then the plain average-gap heuristic. Works
 * even when the heuristic itself has no prediction yet (e.g. only one
 * past order) — a manual override doesn't need order history to apply.
 */
export function resolveEffectiveDate(group: ItemGroup, override: ItemReorderOverride | undefined): Date | null {
  if (override?.manualNextDate) return new Date(override.manualNextDate);
  if (override?.dailyConsumptionRate) {
    const days = group.lastQuantity / override.dailyConsumptionRate;
    return new Date(new Date(group.lastOrderDate).getTime() + days * 86_400_000);
  }
  return group.predictedNext;
}

export function buildItemGroups(orders: Order[]): ItemGroup[] {
  // A cancelled order was never actually fulfilled — not a real "the
  // customer bought this" signal, so it shouldn't feed the reorder cycle.
  const realOrders = orders.filter((o) => o.status !== 'CANCELLED');
  const sorted = [...realOrders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const groups = new Map<
    string,
    { label: string; dates: string[]; quantities: number[]; orderRefs: { id: string; invoiceNumber: string }[] }
  >();

  for (const order of sorted) {
    for (const item of order.items) {
      const identity = itemIdentity(item);
      if (!identity) continue;
      const entry = groups.get(identity.key) ?? { label: identity.label, dates: [], quantities: [], orderRefs: [] };
      entry.dates.push(order.date);
      entry.quantities.push(itemQuantity(item));
      entry.orderRefs.push({ id: order.id, invoiceNumber: order.invoiceNumber });
      groups.set(identity.key, entry);
    }
  }

  const result: ItemGroup[] = [];
  for (const [key, g] of groups) {
    const lastIdx = g.dates.length - 1;
    let avgGapDays: number | null = null;
    let predictedNext: Date | null = null;
    if (g.dates.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < g.dates.length; i++) {
        gaps.push((new Date(g.dates[i]!).getTime() - new Date(g.dates[i - 1]!).getTime()) / 86_400_000);
      }
      avgGapDays = gaps.reduce((sum, v) => sum + v, 0) / gaps.length;
      predictedNext = new Date(new Date(g.dates[lastIdx]!).getTime() + avgGapDays * 86_400_000);
    }
    result.push({
      key,
      label: g.label,
      orderCount: g.dates.length,
      totalQuantity: g.quantities.reduce((sum, v) => sum + v, 0),
      lastOrderDate: g.dates[lastIdx]!,
      lastOrderId: g.orderRefs[lastIdx]!.id,
      lastInvoiceNumber: g.orderRefs[lastIdx]!.invoiceNumber,
      lastQuantity: g.quantities[lastIdx]!,
      avgGapDays,
      predictedNext,
    });
  }

  // Sorting itself stays on the plain auto heuristic — a manual override
  // reorders the *effective* due-ness the caller cares about, but this
  // function has no access to overrides (fetched separately), so it just
  // returns groups in a stable, sensible default order; each caller
  // re-sorts by effective date once overrides are merged in.
  return result.sort((a, b) => {
    if (a.predictedNext && b.predictedNext) return a.predictedNext.getTime() - b.predictedNext.getTime();
    if (a.predictedNext) return -1;
    if (b.predictedNext) return 1;
    return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
  });
}

export function isSoon(d: Date, now: number = Date.now()): boolean {
  return (d.getTime() - now) / 86_400_000 <= 7;
}

export function isOverdue(d: Date, now: number = Date.now()): boolean {
  return d.getTime() < now;
}
