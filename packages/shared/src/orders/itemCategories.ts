import type { OrderItemPricingInput } from '../schemas/orderItemPricing.js';
import type { ProductionTrack } from '../schemas/order.js';
import type { ServiceCategory } from '../schemas/service.js';

/**
 * FEATURE-009 (2026-08-13) — the "business structure" of الطلبات والمستندات
 * the owner asked for: Parent Tabs (Offset/Digital/لوحات وإعلانات/خدمات/
 * منتجات جاهزة), each with its own independent pricing path. This is a
 * declarative registry, not branching UI code — mirrors the same pattern
 * `SETTINGS_CATEGORIES` (`apps/web/src/pages/settings/categories.ts`)
 * already uses for Settings' own category tabs. Adding a path later, or
 * turning Digital from `status: 'pending'` into a real one once its
 * pricing rules are defined, means editing this file (plus adding the new
 * `kind` to `orderItemPricing.ts` and its calculation function) — the
 * existing pricing kinds and their calculation functions are never
 * touched by this file.
 *
 * Moved here from `apps/web/src/lib/orders/itemCategories.ts` (2026-08-16,
 * "أمر شغل مستقل لكل صنف حسب مساره") — this registry is now the single
 * source of truth for which `ProductionTrack` each tab's items resolve to,
 * read by BOTH the composer (client-side stamping) and the server
 * (`orderService.ts`'s validation) so the two can never drift apart. See
 * `productionTrack` on `OrderItemParentTab` below.
 */

type PricingKind = OrderItemPricingInput['kind'];

export interface OrderItemSubTab {
  id: string;
  label: string;
  kind: PricingKind;
  /** Only set for SERVICE sub-tabs — narrows which catalog `Service` rows show in the picker. */
  serviceCategory?: ServiceCategory;
}

export interface OrderItemParentTab {
  id: string;
  label: string;
  /** 'pending' = tab shows, but has no pricing logic yet — the composer must not let the user build a priced item under it. */
  status: 'ready' | 'pending';
  /** Set only for parents with no sub-tabs (لوحات وإعلانات، منتجات جاهزة) — the single kind that parent's form builds. */
  kind?: PricingKind;
  subTabs?: OrderItemSubTab[];
  /**
   * The Work Order production track this tab's items resolve to,
   * automatically, with no staff selection involved (owner, 2026-08-16:
   * "الغيها خالص — النظام يحدد لوحده" — the previous manual per-order
   * "المسار الإنتاجي" dropdown is gone; each item now carries its own
   * track, implied entirely by which tab it was composed under).
   * `undefined` = this tab's items never enter production at all
   * (`INVENTORY_RETAIL` — an immediate retail stock sale, not a job).
   */
  productionTrack?: ProductionTrack;
}

export const ORDER_ITEM_CATEGORIES: OrderItemParentTab[] = [
  {
    id: 'OFFSET',
    label: 'أوفست',
    status: 'ready',
    productionTrack: 'OFFSET',
    subTabs: [
      { id: 'LOOSE_PAPER', label: 'ورق سايب', kind: 'LOOSE_PAPER' },
      { id: 'NOTEBOOK', label: 'دفاتر', kind: 'NOTEBOOK' },
      { id: 'FOLDER', label: 'فولدرات', kind: 'FOLDER' },
      { id: 'ENVELOPE', label: 'أظرف', kind: 'ENVELOPE' },
    ],
  },
  {
    id: 'DIGITAL',
    label: 'ديجيتال',
    status: 'ready',
    kind: 'DIGITAL',
    productionTrack: 'DIGITAL',
  },
  {
    id: 'BOARDS_SIGNAGE',
    label: 'لوحات وإعلانات',
    status: 'ready',
    kind: 'BOARDS',
    productionTrack: 'BOARDS_SIGNAGE',
  },
  {
    id: 'SERVICES',
    label: 'خدمات',
    status: 'ready',
    productionTrack: 'SERVICES',
    subTabs: [
      { id: 'DESIGN', label: 'التصميم', kind: 'SERVICE', serviceCategory: 'DESIGN' },
      { id: 'MONTAGE', label: 'المونتاج', kind: 'SERVICE', serviceCategory: 'MONTAGE' },
      { id: 'WEBSITES', label: 'بناء المواقع الإلكترونية', kind: 'SERVICE', serviceCategory: 'WEBSITES' },
      { id: 'PHOTOGRAPHY', label: 'التصوير', kind: 'SERVICE', serviceCategory: 'PHOTOGRAPHY' },
      { id: 'MARKETING', label: 'التسويق', kind: 'SERVICE', serviceCategory: 'MARKETING' },
    ],
  },
  {
    id: 'READY_PRODUCTS',
    label: 'منتجات جاهزة',
    status: 'ready',
    kind: 'PRODUCT',
    productionTrack: 'READY_PRODUCTS',
  },
  // system_specifications_v2.md (2026-08-16, owner: "مخزون جاهز عندي") —
  // distinct from "منتجات جاهزة" above: that tab prices off the
  // stock-untracked `ReadyProduct` catalog, this one sells real held stock
  // (barcode scan-to-add + quantity deduction) via `InventoryItem.salePrice`.
  // No `productionTrack` — a retail stock sale is never a production job.
  {
    id: 'INVENTORY_RETAIL',
    label: 'بضاعة من المخزون',
    status: 'ready',
    kind: 'INVENTORY_RETAIL',
  },
  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16, owner: "كتالوج واحد
  // مشترك") — reuses the identical PRODUCT kind + ReadyProduct catalog
  // picker READY_PRODUCTS already has (same items, same "+ إضافة" flow in
  // Settings), distinguished only by which tab it was sold under — no new
  // pricing formula, matches the flat-catalog-price precedent.
  {
    id: 'SUBLIMATION_GIFTS',
    label: 'سبليميشن وهدايا',
    status: 'ready',
    kind: 'PRODUCT',
    productionTrack: 'SUBLIMATION_GIFTS',
  },
];

/** Looks up which `ProductionTrack` a parent tab's items resolve to — the one function both the composer (client-side stamping) and the server (validation) call, so they can never disagree. */
export function resolveProductionTrackForTab(parentId: string): ProductionTrack | null {
  return ORDER_ITEM_CATEGORIES.find((p) => p.id === parentId)?.productionTrack ?? null;
}

/**
 * Derives which parent/sub tab an existing item's `kind` (+ service
 * category / productionTrack, when relevant) belongs under — used to
 * select the right tab when the composer opens with a default/edited
 * draft. `productionTrack` is checked first and takes priority: since
 * READY_PRODUCTS and SUBLIMATION_GIFTS now share the same `kind`
 * ('PRODUCT'), `kind` alone can no longer disambiguate them — an item's
 * own frozen `productionTrack` is the only reliable signal once it exists.
 * Falls back to Offset/ورق سايب, the composer's own long-standing default.
 */
export function findCategoryForKind(
  kind: PricingKind,
  serviceCategory?: ServiceCategory | null,
  productionTrack?: ProductionTrack | null,
): { parentId: string; subTabId?: string } {
  if (productionTrack) {
    const byTrack = ORDER_ITEM_CATEGORIES.find((p) => p.productionTrack === productionTrack && p.kind === kind);
    if (byTrack) return { parentId: byTrack.id };
  }
  for (const parent of ORDER_ITEM_CATEGORIES) {
    if (parent.kind === kind) return { parentId: parent.id };
    const subTab = parent.subTabs?.find((s) => s.kind === kind && (kind !== 'SERVICE' || s.serviceCategory === serviceCategory));
    if (subTab) return { parentId: parent.id, subTabId: subTab.id };
  }
  return { parentId: 'OFFSET', subTabId: 'LOOSE_PAPER' };
}
