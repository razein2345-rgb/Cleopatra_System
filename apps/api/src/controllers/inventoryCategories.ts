import type { Request, Response } from 'express';
import { createInventoryCategorySchema, updateInventoryCategorySchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { isCategoryInUse, mapCategoryToDto } from '../services/inventoryCategoryService.js';
import { recordAudit } from '../services/auditService.js';

/** Mirrors `partnerCategories.ts` exactly — same CRUD shape, same audit actions. */

async function loadCategoryOr404(id: string, res: Response) {
  const category = await prisma.inventoryCategory.findUnique({ where: { id } });
  if (!category || category.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Category not found' } });
    return null;
  }
  return category;
}

export async function listInventoryCategories(_req: Request, res: Response) {
  const categories = await prisma.inventoryCategory.findMany({
    where: { isDeleted: false },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: categories.map(mapCategoryToDto) });
}

export async function createInventoryCategory(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createInventoryCategorySchema.parse(req.body);
  const category = await prisma.inventoryCategory.create({ data: input });

  await recordAudit({
    entityType: 'InventoryCategory',
    entityId: category.id,
    action: 'CREATE_CATEGORY',
    performedById: auth.staffId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: mapCategoryToDto(category) });
}

export async function updateInventoryCategory(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadCategoryOr404(req.params.id, res);
  if (!existing) return;

  const input = updateInventoryCategorySchema.parse(req.body);
  const updated = await prisma.inventoryCategory.update({
    where: { id: existing.id },
    data: input,
  });

  await recordAudit({
    entityType: 'InventoryCategory',
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

export async function deleteInventoryCategory(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadCategoryOr404(req.params.id, res);
  if (!existing) return;

  if (await isCategoryInUse(existing.id)) {
    res.status(409).json({
      success: false,
      error: {
        message: 'Cannot delete a category currently assigned to one or more inventory items',
        code: 'CATEGORY_IN_USE',
      },
    });
    return;
  }

  const deleted = await prisma.inventoryCategory.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
    select: { id: true },
  });

  await recordAudit({
    entityType: 'InventoryCategory',
    entityId: deleted.id,
    action: 'DELETE_CATEGORY',
    performedById: auth.staffId,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
