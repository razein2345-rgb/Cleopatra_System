import type { Request, Response } from 'express';
import { createExtraServiceOptionSchema, updateExtraServiceOptionSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { mapExtraServiceOptionToDto } from '../services/extraServiceOptionService.js';
import { recordAudit } from '../services/auditService.js';

async function loadOptionOr404(id: string, res: Response) {
  const option = await prisma.extraServiceOption.findUnique({ where: { id } });
  if (!option || option.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Extra service option not found' } });
    return null;
  }
  return option;
}

export async function listExtraServiceOptions(_req: Request, res: Response) {
  const options = await prisma.extraServiceOption.findMany({
    where: { isDeleted: false },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
  res.json({ success: true, data: options.map(mapExtraServiceOptionToDto) });
}

export async function createExtraServiceOption(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createExtraServiceOptionSchema.parse(req.body);
  const option = await prisma.extraServiceOption.create({ data: input });

  await recordAudit({
    entityType: 'ExtraServiceOption',
    entityId: option.id,
    action: 'CREATE',
    performedById: auth.staffId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: mapExtraServiceOptionToDto(option) });
}

export async function updateExtraServiceOption(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadOptionOr404(req.params.id, res);
  if (!existing) return;

  const input = updateExtraServiceOptionSchema.parse(req.body);
  const updated = await prisma.extraServiceOption.update({ where: { id: existing.id }, data: input });

  await recordAudit({
    entityType: 'ExtraServiceOption',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    previousValue: { label: existing.label, isActive: existing.isActive, sortOrder: existing.sortOrder },
    newValue: input,
  });

  res.json({ success: true, data: mapExtraServiceOptionToDto(updated) });
}

/** Soft delete only (ADR 0007) — no "in use" guard needed: existing order items keep their own frozen breakdown snapshot regardless of catalog changes (same as every other catalog entity here). */
export async function deleteExtraServiceOption(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadOptionOr404(req.params.id, res);
  if (!existing) return;

  const deleted = await prisma.extraServiceOption.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
    select: { id: true },
  });

  await recordAudit({
    entityType: 'ExtraServiceOption',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
