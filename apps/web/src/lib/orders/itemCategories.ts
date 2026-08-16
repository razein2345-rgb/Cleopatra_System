import type { OrderItemPricingInput, ServiceCategory } from '@cleopatra/shared';

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
 * existing 7 pricing kinds and their calculation functions are never
 * touched by this file.
 *
 * Owner (2026-08-13): "لوحات وإعلانات" already has a complete, working
 * pricing path (`BOARDS` kind — banner/vinyl/flex/seasro, per-meter, no
 * margin) — this registry just re-parents it under the new tab, it does
 * not change it. Digital (`DIGITAL` kind, Yield-based costing per
 * system_specifications_v2.md §13.3) was added 2026-08-16 with explicit
 * owner approval — the first real implementation of this track's pricing,
 * not a modification of anything pre-existing.
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
  /** 'pending' = tab shows, but has no pricing logic yet (Digital) — the composer must not let the user build a priced item under it. */
  status: 'ready' | 'pending';
  /** Set only for parents with no sub-tabs (لوحات وإعلانات، منتجات جاهزة) — the single kind that parent's form builds. */
  kind?: PricingKind;
  subTabs?: OrderItemSubTab[];
}

export const ORDER_ITEM_CATEGORIES: OrderItemParentTab[] = [
  {
    id: 'OFFSET',
    label: 'أوفست',
    status: 'ready',
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
  },
  {
    id: 'BOARDS_SIGNAGE',
    label: 'لوحات وإعلانات',
    status: 'ready',
    kind: 'BOARDS',
  },
  {
    id: 'SERVICES',
    label: 'خدمات',
    status: 'ready',
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
  },
];

/** Derives which parent/sub tab an existing item's `kind` (+ service category, when relevant) belongs under — used to select the right tab when the composer opens with a default/edited draft. Falls back to Offset/ورق سايب, the composer's own long-standing default kind. */
export function findCategoryForKind(
  kind: PricingKind,
  serviceCategory?: ServiceCategory | null,
): { parentId: string; subTabId?: string } {
  for (const parent of ORDER_ITEM_CATEGORIES) {
    if (parent.kind === kind) return { parentId: parent.id };
    const subTab = parent.subTabs?.find((s) => s.kind === kind && (kind !== 'SERVICE' || s.serviceCategory === serviceCategory));
    if (subTab) return { parentId: parent.id, subTabId: subTab.id };
  }
  return { parentId: 'OFFSET', subTabId: 'LOOSE_PAPER' };
}
