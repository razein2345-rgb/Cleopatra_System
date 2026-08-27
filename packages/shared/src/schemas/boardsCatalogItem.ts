import { z } from 'zod';

/**
 * Owner (2026-08-27, "المفروض أقدر أضيف خدمات في صنف اللوحات والإعلانات
 * وأضيف سعرها عندي وسعرها عند المورد... زي الروول اب بيتكون من رول أب
 * وبانر") — a flat-priced accessory sold under "اللوحات والإعلانات"
 * alongside the size-based materials (Banner/Vinyl/Flex/...), e.g. a
 * Roll-Up stand: priced per piece (not per square meter), with its own
 * default supplier cost, independent of the banner's own per-meter
 * pricing. Admin-manageable, same "no size/name Hardcoded" discipline as
 * `SheetType`/`Service`.
 */
export const boardsCatalogItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  /** Our price to the customer, flat per piece. */
  price: z.number().nonnegative(),
  /**
   * Owner: "ساعات بجيب الرول اب من عند المورد... وساعات بجيب انا الرول اب
   * وبيحاسبني على تكلفة البانر والتركيب" — the real cost genuinely varies
   * by how it was sourced that specific time, so this is only ever a
   * *default* for profit estimation (overridable per order — see
   * `boardsPricingInputSchema`'s `supplierCostOverride`), never a fixed
   * ledger figure. Sensitive financial data — same `inventory.costPrice`
   * permission gate as `InventoryItem.costPrice`/`ReadyProduct.costPrice`.
   * Omitted (not merely null) for a caller without that permission.
   */
  supplierCost: z.number().nonnegative().nullable().optional(),
  /**
   * Owner (2026-08-27, "الرول بيتجاب من مورد مختلف هسجله وبيتحط عليه
   * البانر عند Smart... حقلين منفصلين") — part 3 of the supplier-linkage
   * initiative: unlike `supplierCost` above (a single total used only for
   * the profit-report breakdown), these two feed a real "قائمة شراء عاجل"
   * row EACH time this item is ordered (no stock concept — "دائمًا
   * بالطلب"). `purchaseSupplierId` = who the physical item is bought
   * from; `assemblySupplierId` = who mounts/assembles it. Both optional.
   */
  purchaseSupplierId: z.string().uuid().nullable(),
  purchaseSupplierName: z.string().nullable(),
  assemblySupplierId: z.string().uuid().nullable(),
  assemblySupplierName: z.string().nullable(),
});

export const createBoardsCatalogItemSchema = boardsCatalogItemSchema
  .omit({ id: true, purchaseSupplierName: true, assemblySupplierName: true })
  .partial({ supplierCost: true, purchaseSupplierId: true, assemblySupplierId: true });
export const updateBoardsCatalogItemSchema = boardsCatalogItemSchema
  .omit({ id: true, purchaseSupplierName: true, assemblySupplierName: true })
  .partial();

export type BoardsCatalogItem = z.infer<typeof boardsCatalogItemSchema>;
export type CreateBoardsCatalogItemInput = z.infer<typeof createBoardsCatalogItemSchema>;
export type UpdateBoardsCatalogItemInput = z.infer<typeof updateBoardsCatalogItemSchema>;
