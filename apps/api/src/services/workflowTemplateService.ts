import type { Prisma } from '../generated/prisma/client.js';
import type { CreateWorkflowStageInput, WorkflowStage, WorkflowStageVariable, WorkflowTemplate } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

const STAGE_INCLUDE = {
  variables: { orderBy: { order: 'asc' } },
} satisfies Prisma.WorkflowStageInclude;

export const TEMPLATE_INCLUDE = {
  stages: { include: STAGE_INCLUDE, orderBy: { order: 'asc' } },
  nextVersion: { select: { id: true } },
} satisfies Prisma.WorkflowTemplateInclude;

type TemplateRecord = Prisma.WorkflowTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>;
type StageRecord = Prisma.WorkflowStageGetPayload<{ include: typeof STAGE_INCLUDE }>;
type StageVariableRecord = Prisma.WorkflowStageVariableGetPayload<object>;

export function mapWorkflowStageVariableToDto(record: StageVariableRecord): WorkflowStageVariable {
  return {
    id: record.id,
    stageId: record.stageId,
    key: record.key,
    label: record.label,
    dataType: record.dataType,
    selectOptions: (record.selectOptions as string[] | null) ?? null,
    isRequired: record.isRequired,
    order: record.order,
  };
}

export function mapWorkflowStageToDto(record: StageRecord): WorkflowStage {
  return {
    id: record.id,
    templateId: record.templateId,
    order: record.order,
    name: record.name,
    stageType: record.stageType,
    departmentId: record.departmentId,
    defaultAssignedEmployeeId: record.defaultAssignedEmployeeId,
    estimatedDurationMinutes: record.estimatedDurationMinutes,
    requiresFiles: record.requiresFiles,
    requiresApproval: record.requiresApproval,
    requiresCostEntry: record.requiresCostEntry,
    requiresTimeTracking: record.requiresTimeTracking,
    isMandatory: record.isMandatory,
    canSkip: record.canSkip,
    nextStageId: record.nextStageId,
    failureStageId: record.failureStageId,
    internalVisible: record.internalVisible,
    customerVisible: record.customerVisible,
    variables: record.variables.map(mapWorkflowStageVariableToDto),
  };
}

export function mapWorkflowTemplateToDto(record: TemplateRecord): WorkflowTemplate {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    version: record.version,
    previousVersionId: record.previousVersionId,
    nextVersionExists: record.nextVersion !== null,
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
    stages: record.stages.map(mapWorkflowStageToDto),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class WorkflowTemplatePublishedError extends Error {
  constructor() {
    super('A published workflow template version is immutable — create a new version instead.');
    this.name = 'WorkflowTemplatePublishedError';
  }
}

export function assertTemplateEditable(template: { publishedAt: Date | null }): void {
  if (template.publishedAt !== null) {
    throw new WorkflowTemplatePublishedError();
  }
}

export class WorkflowStageGraphError extends Error {}

/**
 * Replaces a template's full stage set inside a transaction — used by both
 * create and update (a draft's stages are always a full replace, matching
 * `updateQuotationSchema`'s items precedent). Resolves `nextStageTempKey`/
 * `failureStageTempKey` to real ids in a second pass, since a stage
 * authored earlier in the same request may need to point at one authored
 * later (see `createWorkflowStageSchema`'s own doc comment).
 */
export async function replaceTemplateStages(
  tx: Prisma.TransactionClient,
  templateId: string,
  stages: CreateWorkflowStageInput[],
): Promise<void> {
  await tx.workflowStage.deleteMany({ where: { templateId } });

  const tempKeyToId = new Map<string, string>();
  const created: Array<{ id: string; input: CreateWorkflowStageInput }> = [];

  for (const input of stages) {
    if (tempKeyToId.has(input.tempKey)) {
      throw new WorkflowStageGraphError(`Duplicate stage tempKey "${input.tempKey}" in the same request`);
    }
    const stage = await tx.workflowStage.create({
      data: {
        templateId,
        order: input.order,
        name: input.name,
        stageType: input.stageType ?? 'INTERNAL',
        departmentId: input.departmentId ?? null,
        defaultAssignedEmployeeId: input.defaultAssignedEmployeeId ?? null,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        requiresFiles: input.requiresFiles ?? false,
        requiresApproval: input.requiresApproval ?? false,
        requiresCostEntry: input.requiresCostEntry ?? false,
        requiresTimeTracking: input.requiresTimeTracking ?? false,
        isMandatory: input.isMandatory ?? true,
        canSkip: input.canSkip ?? false,
        internalVisible: input.internalVisible ?? true,
        customerVisible: input.customerVisible ?? false,
        variables: input.variables
          ? {
              create: input.variables.map((v) => ({
                key: v.key,
                label: v.label,
                dataType: v.dataType ?? 'TEXT',
                selectOptions: v.selectOptions ?? undefined,
                isRequired: v.isRequired ?? false,
                order: v.order ?? 0,
              })),
            }
          : undefined,
      },
    });
    tempKeyToId.set(input.tempKey, stage.id);
    created.push({ id: stage.id, input });
  }

  for (const { id, input } of created) {
    const nextStageId = input.nextStageTempKey
      ? tempKeyToId.get(input.nextStageTempKey)
      : (input.nextStageId ?? undefined);
    if (input.nextStageTempKey && !nextStageId) {
      throw new WorkflowStageGraphError(`nextStageTempKey "${input.nextStageTempKey}" does not match any stage in this request`);
    }
    const failureStageId = input.failureStageTempKey
      ? tempKeyToId.get(input.failureStageTempKey)
      : (input.failureStageId ?? undefined);
    if (input.failureStageTempKey && !failureStageId) {
      throw new WorkflowStageGraphError(`failureStageTempKey "${input.failureStageTempKey}" does not match any stage in this request`);
    }
    if (nextStageId || failureStageId) {
      await tx.workflowStage.update({
        where: { id },
        data: { nextStageId: nextStageId ?? null, failureStageId: failureStageId ?? null },
      });
    }
  }
}

/** The version a new `WorkOrder` starts on — the latest published version for a template `code`. */
export async function getLatestPublishedTemplate(code: string): Promise<TemplateRecord | null> {
  return prisma.workflowTemplate.findFirst({
    where: { code, publishedAt: { not: null }, isDeleted: false },
    orderBy: { version: 'desc' },
    include: TEMPLATE_INCLUDE,
  });
}
