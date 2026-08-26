import { z } from 'zod';

/** FEATURE-009 (2026-08-13, owner: "لا تبني Products جاهزة على افتراض أن كل المنتجات يتم إنتاجها داخل المطبعة") — metadata only, no pricing/workflow behavior attached to it yet. */
export const productSourceTypeSchema = z.enum(['INTERNAL_PRODUCTION', 'EXTERNAL_SUPPLIER']);

export const readyProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  sourceType: productSourceTypeSchema.nullable(),
  /**
   * Owner (2026-08-26, "المفروض إنها وهي بتتسجل يتسجل هي واقفه علينا بكام
   * وبنبيعها بكام") — the purchase/cost price, so profit (price -
   * costPrice) is computable. Sensitive financial data — restricted to
   * SUPER_ADMIN for both read and write (readyProducts.ts controller
   * strips this field from the response entirely for anyone else, and
   * rejects a write attempt that includes it), same discipline as
   * attendance/payroll records. Omitted (not merely null) for a
   * non-SUPER_ADMIN caller — `.optional()` reflects that.
   */
  costPrice: z.number().nonnegative().nullable().optional(),
});

export const createReadyProductSchema = readyProductSchema.omit({ id: true }).partial({ sourceType: true, costPrice: true });
export const updateReadyProductSchema = readyProductSchema.omit({ id: true }).partial();

export type ProductSourceType = z.infer<typeof productSourceTypeSchema>;
export type ReadyProduct = z.infer<typeof readyProductSchema>;
export type CreateReadyProductInput = z.infer<typeof createReadyProductSchema>;
export type UpdateReadyProductInput = z.infer<typeof updateReadyProductSchema>;
