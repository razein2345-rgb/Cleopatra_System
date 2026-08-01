import { z } from 'zod';

export const sheetBaseSchema = z.enum(['REGULAR', 'GAYER']);

export const inventoryUnitSchema = z.enum([
  'SHEET',
  'ROLL',
  'LINEAR_METER',
  'SQUARE_METER',
  'PIECE',
  'KILOGRAM',
  'LITER',
]);

export const sheetTypeSchema = z.object({
  id: z.string().uuid(),
  base: sheetBaseSchema,
  name: z.string().min(1),
  price: z.number().nonnegative(),
  unit: inventoryUnitSchema,
});

export const createSheetTypeSchema = z.object({
  base: sheetBaseSchema,
  name: z.string().min(1),
  price: z.number().nonnegative().default(0),
  unit: inventoryUnitSchema.default('SHEET'),
});

export const updateSheetTypeSchema = createSheetTypeSchema.partial();

export type SheetBase = z.infer<typeof sheetBaseSchema>;
export type InventoryUnit = z.infer<typeof inventoryUnitSchema>;
export type SheetType = z.infer<typeof sheetTypeSchema>;
export type CreateSheetTypeInput = z.infer<typeof createSheetTypeSchema>;
export type UpdateSheetTypeInput = z.infer<typeof updateSheetTypeSchema>;
