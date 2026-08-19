import type { Request, Response } from 'express';
import { createTreasuryCategorySchema, updateTreasuryCategorySchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { mapTreasuryCategoryToDto } from '../services/treasuryCategoryService.js';
import { recordAudit } from '../services/auditService.js';

async function loadCategoryOr404(id: string, res: Response) {
  const category = await prisma.treasuryCategory.findUnique({ where: { id } });
  if (!category || category.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Treasury category not found' } });
    return null;
  }
  return category;
}

export async function listTreasuryCategories(_req: Request, res: Response) {
  const categories = await prisma.treasuryCategory.findMany({
    where: { isDeleted: false },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: categories.map(mapTreasuryCategoryToDto) });
}

export async function createTreasuryCategory(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createTreasuryCategorySchema.parse(req.body);
  const category = await prisma.treasuryCategory.create({ data: input });

  await recordAudit({
    entityType: 'TreasuryCategory',
    entityId: category.id,
    action: 'CREATE_CATEGORY',
    performedById: auth.staffId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: mapTreasuryCategoryToDto(category) });
}

export async function updateTreasuryCategory(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadCategoryOr404(req.params.id, res);
  if (!existing) return;

  const input = updateTreasuryCategorySchema.parse(req.body);
  const updated = await prisma.treasuryCategory.update({ where: { id: existing.id }, data: input });

  await recordAudit({
    entityType: 'TreasuryCategory',
    entityId: updated.id,
    action: 'UPDATE_CATEGORY',
    performedById: auth.staffId,
    previousValue: { name: existing.name, isActive: existing.isActive },
    newValue: input,
  });

  res.json({ success: true, data: mapTreasuryCategoryToDto(updated) });
}

/**
 * Soft delete only (ADR 0007). Unlike PartnerTag/PartnerCategory there is no
 * FK from TreasuryEntry to this table (entries keep a plain free-text
 * `category` string), so there is nothing to orphan and no "in use" guard
 * is needed — deactivating (isActive: false) is the normal way to retire a
 * category from the picker while keeping it for historical reporting;
 * delete is for outright mistakes.
 */
export async function deleteTreasuryCategory(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadCategoryOr404(req.params.id, res);
  if (!existing) return;

  const deleted = await prisma.treasuryCategory.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
    select: { id: true },
  });

  await recordAudit({
    entityType: 'TreasuryCategory',
    entityId: deleted.id,
    action: 'DELETE_CATEGORY',
    performedById: auth.staffId,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
