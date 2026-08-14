import { z } from 'zod';
import { productionTrackSchema } from './order.js';

export const departmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  // FEATURE-010 (2026-08-14) — see the Prisma field's own doc comment: null
  // for departments shared across every track or unrelated to production.
  productionTrack: productionTrackSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Code must be uppercase letters, numbers, and underscores'),
  description: z.string().trim().min(1).max(500).optional(),
  productionTrack: productionTrackSchema.optional(),
});

/** `code` is stable/machine-referenced (the `Role.name` pattern) — not editable after creation. */
export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().min(1).max(500).nullable().optional(),
  productionTrack: productionTrackSchema.nullable().optional(),
});

export type Department = z.infer<typeof departmentSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
