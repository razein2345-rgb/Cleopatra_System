import type { Request, Response } from 'express';
import { createPartnerCategorySchema, updatePartnerCategorySchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { isCategoryInUse, mapCategoryToDto } from '../services/partnerCategoryService.js';
import { recordAudit } from '../services/auditService.js';

async function loadCategoryOr404(id: string, res: Response) {
  const category = await prisma.partnerCategory.findUnique({ where: { id } });
  if (!category || category.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Category not found' } });
    return null;
  }
  return category;
}

export async function listPartnerCategories(_req: Request, res: Response) {
  const categories = await prisma.partnerCategory.findMany({
    where: { isDeleted: false },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: categories.map(mapCategoryToDto) });
}

export async function createPartnerCategory(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createPartnerCategorySchema.parse(req.body);
  const category = await prisma.partnerCategory.create({ data: input });

  await recordAudit({
    entityType: 'PartnerCategory',
    entityId: category.id,
    action: 'CREATE_CATEGORY',
    performedById: auth.staffId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: mapCategoryToDto(category) });
}

export async function updatePartnerCategory(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadCategoryOr404(req.params.id, res);
  if (!existing) return;

  const input = updatePartnerCategorySchema.parse(req.body);
  const updated = await prisma.partnerCategory.update({
    where: { id: existing.id },
    data: input,
  });

  await recordAudit({
    entityType: 'PartnerCategory',
    entityId: updated.id,
    action: 'UPDATE_CATEGORY',
    performedById: auth.staffId,
    previousValue: {
      name: existing.name,
      description: existing.description,
      isActive: existing.isActive,
    },
    newValue: input,
  });

  res.json({ success: true, data: mapCategoryToDto(updated) });
}

/**
 * Soft delete only (ADR 0007), and only when the category is not currently
 * assigned to any active partner (00_REQUIREMENTS.md / the explicit M4
 * "deleting an assigned category must be prevented" rule).
 */
export async function deletePartnerCategory(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadCategoryOr404(req.params.id, res);
  if (!existing) return;

  if (await isCategoryInUse(existing.id)) {
    res.status(409).json({
      success: false,
      error: {
        message: 'Cannot delete a category currently assigned to one or more business partners',
        code: 'CATEGORY_IN_USE',
      },
    });
    return;
  }

  const deleted = await prisma.partnerCategory.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
    select: { id: true },
  });

  await recordAudit({
    entityType: 'PartnerCategory',
    entityId: deleted.id,
    action: 'DELETE_CATEGORY',
    performedById: auth.staffId,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
