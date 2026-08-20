import { z } from 'zod';
import { digitalColorModeSchema, digitalPrintBasisSchema, digitalSidesSchema } from './orderItemPricing.js';

/**
 * Owner (2026-08-20, "شرائح كمية أعدلها بنفسي من الإعدادات") — one row of
 * one of the 12 admin-managed (basis, colorMode, sides) tier tables. See
 * `digitalCostCalculation.ts`'s doc comment for the full pricing model
 * this feeds.
 */
export const digitalPriceTierSchema = z.object({
  id: z.string().uuid(),
  basis: digitalPrintBasisSchema,
  colorMode: digitalColorModeSchema,
  sides: digitalSidesSchema,
  minQuantity: z.number().int().nonnegative(),
  pricePerUnit: z.number().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createDigitalPriceTierSchema = z.object({
  basis: digitalPrintBasisSchema,
  colorMode: digitalColorModeSchema,
  sides: digitalSidesSchema,
  minQuantity: z.number().int().nonnegative(),
  pricePerUnit: z.number().nonnegative(),
});

export const updateDigitalPriceTierSchema = z.object({
  minQuantity: z.number().int().nonnegative().optional(),
  pricePerUnit: z.number().nonnegative().optional(),
});

export type DigitalPriceTierDto = z.infer<typeof digitalPriceTierSchema>;
export type CreateDigitalPriceTierInput = z.infer<typeof createDigitalPriceTierSchema>;
export type UpdateDigitalPriceTierInput = z.infer<typeof updateDigitalPriceTierSchema>;
