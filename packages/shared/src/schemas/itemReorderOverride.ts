import { z } from 'zod';

/**
 * Owner (2026-08-26, "الوقت بيتحسب تقريبي بس ممكن اعدله يدوي" +
 * "أحسب مثلا هو بيسهلك كام قطعة في اليوم ... ولو قالي تقريباً بيخلص في
 * كذا فا اكتب التاريخ") — a manual correction on top of the auto
 * average-gap reorder estimate, keyed per item per customer via the
 * same best-effort `itemKey` `ReorderPredictionTab.tsx`'s `itemIdentity()`
 * computes (`inv:<inventoryItemId>` or `name:<lowercased label>`).
 *
 * Resolution order the frontend applies (see ReorderPredictionTab.tsx):
 * `manualNextDate` (a direct date the owner was told) wins over
 * `dailyConsumptionRate` (last order's quantity ÷ this rate) which wins
 * over the plain average-gap-between-orders heuristic.
 */
export const itemReorderOverrideSchema = z.object({
  id: z.string().uuid(),
  partnerId: z.string().uuid(),
  itemKey: z.string(),
  itemLabel: z.string(),
  dailyConsumptionRate: z.number().positive().nullable(),
  manualNextDate: z.string().nullable(),
  createdBy: z.string().uuid(),
  updatedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Upsert body — `itemKey`/`itemLabel` come from the URL/route, not the body. */
export const upsertItemReorderOverrideSchema = z.object({
  itemLabel: z.string().trim().min(1),
  dailyConsumptionRate: z.number().positive().nullable().optional(),
  manualNextDate: z.string().nullable().optional(),
});

export type ItemReorderOverride = z.infer<typeof itemReorderOverrideSchema>;
export type UpsertItemReorderOverrideInput = z.infer<typeof upsertItemReorderOverrideSchema>;
