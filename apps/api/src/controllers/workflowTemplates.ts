import type { Request, Response } from 'express';
import { createWorkflowTemplateSchema, updateWorkflowTemplateSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import {
  TEMPLATE_INCLUDE,
  WorkflowStageGraphError,
  WorkflowTemplatePublishedError,
  assertTemplateEditable,
  mapWorkflowTemplateToDto,
  replaceTemplateStages,
} from '../services/workflowTemplateService.js';
import { recordAudit } from '../services/auditService.js';

function handleStageGraphError(err: unknown, res: Response): boolean {
  if (err instanceof WorkflowStageGraphError) {
    res.status(400).json({ success: false, error: { message: err.message, code: 'INVALID_STAGE_GRAPH' } });
    return true;
  }
  return false;
}

export async function listWorkflowTemplates(req: Request, res: Response) {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const templates = await prisma.workflowTemplate.findMany({
    where: { isDeleted: false, ...(code ? { code } : {}) },
    include: TEMPLATE_INCLUDE,
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
  });
  res.json({ success: true, data: templates.map(mapWorkflowTemplateToDto) });
}

export async function getWorkflowTemplate(req: Request<{ id: string }>, res: Response) {
  const template = await prisma.workflowTemplate.findUnique({
    where: { id: req.params.id },
    include: TEMPLATE_INCLUDE,
  });
  if (!template || template.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Workflow template not found' } });
    return;
  }
  res.json({ success: true, data: mapWorkflowTemplateToDto(template) });
}

/** Creates a new draft (`publishedAt: null`) — the first version (1) for a new `code`, or use `.../versions` to branch off an existing one. */
export async function createWorkflowTemplate(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createWorkflowTemplateSchema.parse(req.body);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const template = await tx.workflowTemplate.create({
        data: { code: input.code, name: input.name, description: input.description ?? null, version: 1 },
      });
      await replaceTemplateStages(tx, template.id, input.stages);
      return tx.workflowTemplate.findUniqueOrThrow({ where: { id: template.id }, include: TEMPLATE_INCLUDE });
    });
  } catch (err) {
    if (handleStageGraphError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'WorkflowTemplate',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    newValue: { code: created.code, name: created.name, version: created.version, stageCount: created.stages.length },
  });

  res.status(201).json({ success: true, data: mapWorkflowTemplateToDto(created) });
}

/** Full replace of a draft's own fields + stages — rejected once published (see Business Rules). */
export async function updateWorkflowTemplate(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.workflowTemplate.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Workflow template not found' } });
    return;
  }

  try {
    assertTemplateEditable(existing);
  } catch (err) {
    if (err instanceof WorkflowTemplatePublishedError) {
      res.status(400).json({ success: false, error: { message: err.message, code: 'TEMPLATE_PUBLISHED' } });
      return;
    }
    throw err;
  }

  const input = updateWorkflowTemplateSchema.parse(req.body);

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      if (input.stages) {
        await replaceTemplateStages(tx, existing.id, input.stages);
      }
      return tx.workflowTemplate.update({
        where: { id: existing.id },
        data: { name: input.name, description: input.description },
        include: TEMPLATE_INCLUDE,
      });
    });
  } catch (err) {
    if (handleStageGraphError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'WorkflowTemplate',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    newValue: { ...input, stageCount: updated.stages.length },
  });

  res.json({ success: true, data: mapWorkflowTemplateToDto(updated) });
}

/** Sets `publishedAt` — makes this version immutable and eligible for new `WorkOrder`s. */
export async function publishWorkflowTemplate(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.workflowTemplate.findUnique({
    where: { id: req.params.id },
    include: { stages: true },
  });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Workflow template not found' } });
    return;
  }
  if (existing.publishedAt) {
    res.status(400).json({
      success: false,
      error: { message: 'This workflow template version is already published', code: 'TEMPLATE_PUBLISHED' },
    });
    return;
  }
  if (existing.stages.length === 0) {
    res.status(400).json({
      success: false,
      error: { message: 'Cannot publish a workflow template with no stages', code: 'NO_STAGES' },
    });
    return;
  }

  const updated = await prisma.workflowTemplate.update({
    where: { id: existing.id },
    data: { publishedAt: new Date() },
    include: TEMPLATE_INCLUDE,
  });

  await recordAudit({
    entityType: 'WorkflowTemplate',
    entityId: updated.id,
    action: 'STATUS_CHANGE',
    performedById: auth.staffId,
    previousValue: { publishedAt: null },
    newValue: { publishedAt: updated.publishedAt },
  });

  res.json({ success: true, data: mapWorkflowTemplateToDto(updated) });
}

/** New draft version — copies the current stage set, mirrors `POST /api/quotations/:id/versions` exactly. */
export async function createWorkflowTemplateVersion(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.workflowTemplate.findUnique({
    where: { id: req.params.id },
    include: TEMPLATE_INCLUDE,
  });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Workflow template not found' } });
    return;
  }

  const created = await prisma.$transaction(async (tx) => {
    const newVersion = await tx.workflowTemplate.create({
      data: {
        code: existing.code,
        name: existing.name,
        description: existing.description,
        version: existing.version + 1,
        previousVersionId: existing.id,
      },
    });

    const tempKeyByStageId = new Map(existing.stages.map((s) => [s.id, `stage-${s.id}`]));
    await replaceTemplateStages(
      tx,
      newVersion.id,
      existing.stages.map((s) => ({
        tempKey: tempKeyByStageId.get(s.id)!,
        order: s.order,
        name: s.name,
        stageType: s.stageType,
        departmentId: s.departmentId ?? undefined,
        defaultAssignedEmployeeId: s.defaultAssignedEmployeeId ?? undefined,
        estimatedDurationMinutes: s.estimatedDurationMinutes ?? undefined,
        requiresFiles: s.requiresFiles,
        requiresApproval: s.requiresApproval,
        requiresCostEntry: s.requiresCostEntry,
        requiresTimeTracking: s.requiresTimeTracking,
        isMandatory: s.isMandatory,
        canSkip: s.canSkip,
        nextStageTempKey: s.nextStageId ? tempKeyByStageId.get(s.nextStageId) : undefined,
        failureStageTempKey: s.failureStageId ? tempKeyByStageId.get(s.failureStageId) : undefined,
        internalVisible: s.internalVisible,
        customerVisible: s.customerVisible,
        variables: s.variables.map((v) => ({
          key: v.key,
          label: v.label,
          dataType: v.dataType,
          selectOptions: (v.selectOptions as string[] | null) ?? undefined,
          isRequired: v.isRequired,
          order: v.order,
        })),
      })),
    );

    return tx.workflowTemplate.findUniqueOrThrow({ where: { id: newVersion.id }, include: TEMPLATE_INCLUDE });
  });

  await recordAudit({
    entityType: 'WorkflowTemplate',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    newValue: { code: created.code, version: created.version, previousVersionId: existing.id },
  });

  res.status(201).json({ success: true, data: mapWorkflowTemplateToDto(created) });
}

/** Soft delete only (ADR 0007). */
export async function deleteWorkflowTemplate(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.workflowTemplate.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Workflow template not found' } });
    return;
  }
  const deleted = await prisma.workflowTemplate.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
  });
  await recordAudit({
    entityType: 'WorkflowTemplate',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
  });
  res.json({ success: true, data: { id: deleted.id } });
}
