import { z } from 'zod';

export const workflowStageTypeSchema = z.enum(['INTERNAL', 'EXTERNAL']);
export const workflowVariableDataTypeSchema = z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT']);

export const workflowStageVariableSchema = z.object({
  id: z.string().uuid(),
  stageId: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  dataType: workflowVariableDataTypeSchema,
  selectOptions: z.array(z.string()).nullable(),
  isRequired: z.boolean(),
  order: z.number().int(),
});

/** No `id` — created fresh alongside its stage every time a template version is authored. */
export const createWorkflowStageVariableSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, 'Key must be a lowercase machine-safe identifier'),
  label: z.string().trim().min(1).max(200),
  dataType: workflowVariableDataTypeSchema.optional(),
  selectOptions: z.array(z.string().trim().min(1)).optional(),
  isRequired: z.boolean().optional(),
  order: z.number().int().optional(),
});

export const workflowStageSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  order: z.number().int(),
  name: z.string(),
  stageType: workflowStageTypeSchema,
  departmentId: z.string().uuid().nullable(),
  defaultAssignedEmployeeId: z.string().uuid().nullable(),
  estimatedDurationMinutes: z.number().int().nullable(),
  requiresFiles: z.boolean(),
  requiresApproval: z.boolean(),
  requiresCostEntry: z.boolean(),
  requiresTimeTracking: z.boolean(),
  isMandatory: z.boolean(),
  canSkip: z.boolean(),
  nextStageId: z.string().uuid().nullable(),
  failureStageId: z.string().uuid().nullable(),
  internalVisible: z.boolean(),
  customerVisible: z.boolean(),
  variables: z.array(workflowStageVariableSchema),
});

/**
 * `tempKey` is a request-scoped identifier (never persisted) that lets
 * `nextStageTempKey`/`failureStageTempKey` reference another stage in the
 * same authoring request before any of them have a real id — the service
 * layer creates every stage first, then resolves temp keys to real
 * `nextStageId`/`failureStageId` values in a second pass. A stage that
 * doesn't need to reference a sibling (or point outside this batch) can
 * still set `nextStageId`/`failureStageId` directly to an existing stage's
 * real id (e.g. when adding one stage to an otherwise-unchanged version).
 */
export const createWorkflowStageSchema = z.object({
  tempKey: z.string().trim().min(1).max(50),
  order: z.number().int(),
  name: z.string().trim().min(1).max(200),
  stageType: workflowStageTypeSchema.optional(),
  departmentId: z.string().uuid().optional(),
  defaultAssignedEmployeeId: z.string().uuid().optional(),
  estimatedDurationMinutes: z.number().int().positive().optional(),
  requiresFiles: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  requiresCostEntry: z.boolean().optional(),
  requiresTimeTracking: z.boolean().optional(),
  isMandatory: z.boolean().optional(),
  canSkip: z.boolean().optional(),
  nextStageId: z.string().uuid().optional(),
  nextStageTempKey: z.string().optional(),
  failureStageId: z.string().uuid().optional(),
  failureStageTempKey: z.string().optional(),
  internalVisible: z.boolean().optional(),
  customerVisible: z.boolean().optional(),
  variables: z.array(createWorkflowStageVariableSchema).optional(),
});

export const workflowTemplateSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  version: z.number().int(),
  previousVersionId: z.string().uuid().nullable(),
  nextVersionExists: z.boolean(),
  publishedAt: z.string().nullable(),
  stages: z.array(workflowStageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createWorkflowTemplateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Code must be uppercase letters, numbers, and underscores'),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000).optional(),
  stages: z.array(createWorkflowStageSchema).min(1),
});

/** Rejected once the template version is published — see `publishWorkflowTemplate`. Items replace the full set, not a per-stage patch (same precedent as Quotation items). */
export const updateWorkflowTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).nullable().optional(),
  stages: z.array(createWorkflowStageSchema).min(1).optional(),
});

export type WorkflowStageType = z.infer<typeof workflowStageTypeSchema>;
export type WorkflowVariableDataType = z.infer<typeof workflowVariableDataTypeSchema>;
export type WorkflowStageVariable = z.infer<typeof workflowStageVariableSchema>;
export type CreateWorkflowStageVariableInput = z.infer<typeof createWorkflowStageVariableSchema>;
export type WorkflowStage = z.infer<typeof workflowStageSchema>;
export type CreateWorkflowStageInput = z.infer<typeof createWorkflowStageSchema>;
export type WorkflowTemplate = z.infer<typeof workflowTemplateSchema>;
export type CreateWorkflowTemplateInput = z.infer<typeof createWorkflowTemplateSchema>;
export type UpdateWorkflowTemplateInput = z.infer<typeof updateWorkflowTemplateSchema>;
