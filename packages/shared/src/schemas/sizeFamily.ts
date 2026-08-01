import { z } from 'zod';
import { sheetBaseSchema } from './sheetType.js';

export const sizeFamilyEntrySchema = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  label: z.string().min(1),
  piecesPerSheet: z.number().positive(),
  sortOrder: z.number().int(),
});

export const sizeFamilySchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1),
  label: z.string().min(1),
  base: sheetBaseSchema,
  entries: z.array(sizeFamilyEntrySchema),
});

export const createSizeFamilySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  base: sheetBaseSchema,
});

export const updateSizeFamilySchema = z.object({
  label: z.string().min(1).optional(),
});

export const addSizeFamilyEntrySchema = z.object({
  label: z.string().min(1),
  piecesPerSheet: z.number().positive(),
});

export const updateSizeFamilyEntrySchema = z.object({
  label: z.string().min(1).optional(),
  piecesPerSheet: z.number().positive().optional(),
});

export type SizeFamily = z.infer<typeof sizeFamilySchema>;
export type SizeFamilyEntry = z.infer<typeof sizeFamilyEntrySchema>;
export type CreateSizeFamilyInput = z.infer<typeof createSizeFamilySchema>;
export type UpdateSizeFamilyInput = z.infer<typeof updateSizeFamilySchema>;
export type AddSizeFamilyEntryInput = z.infer<typeof addSizeFamilyEntrySchema>;
export type UpdateSizeFamilyEntryInput = z.infer<typeof updateSizeFamilyEntrySchema>;
