import { z } from 'zod';

/**
 * FEATURE-006 — Document Templates & Printing. Matches the Prisma
 * `DocumentType` enum (already existed, reserved for `DocumentSequence`
 * since Phase 1/ADR 0008, unused by any shared DTO until now).
 */
export const documentTypeSchema = z.enum(['QUOTATION', 'INVOICE', 'WORK_ORDER']);

/**
 * Flexible, not rigidly typed — header/footer/section-visibility/terms/
 * signature-area toggles, matching the project's own established
 * `variableValues: Json` precedent (`StageInstance`). The exact key set
 * a renderer expects is a Milestone 7 concern, not a storage-layer one.
 */
export const documentTemplateConfigSchema = z.record(z.string(), z.unknown());

/**
 * Versioned exactly like `WorkflowTemplate` (FEATURE-004): `publishedAt`
 * null = draft (editable in place), non-null = immutable. A document may
 * only freeze its `documentTemplateId` against a *published* version —
 * enforced in the service layer, not here (M8/M9/M10).
 */
export const documentTemplateSchema = z.object({
  id: z.string().uuid(),
  documentType: documentTypeSchema,
  name: z.string(),
  config: documentTemplateConfigSchema,
  isDefault: z.boolean(),
  version: z.number().int(),
  previousVersionId: z.string().uuid().nullable(),
  nextVersionExists: z.boolean(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createDocumentTemplateSchema = z.object({
  documentType: documentTypeSchema,
  name: z.string().trim().min(1).max(100),
  config: documentTemplateConfigSchema.default({}),
});

/** Only legal while the template is still a draft (`publishedAt: null`) — enforced in the service layer. */
export const updateDocumentTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  config: documentTemplateConfigSchema.optional(),
});

export type DocumentType = z.infer<typeof documentTypeSchema>;
export type DocumentTemplateConfig = z.infer<typeof documentTemplateConfigSchema>;
export type DocumentTemplate = z.infer<typeof documentTemplateSchema>;
export type CreateDocumentTemplateInput = z.infer<typeof createDocumentTemplateSchema>;
export type UpdateDocumentTemplateInput = z.infer<typeof updateDocumentTemplateSchema>;
