import type { Request, Response } from 'express';
import { createSheetTypeSchema, updateSheetTypeSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { serializeDecimals } from '../utils/serialize.js';

export async function listSheetTypes(req: Request, res: Response) {
  const base = typeof req.query.base === 'string' ? req.query.base.toUpperCase() : undefined;
  const items = await prisma.sheetType.findMany({
    where: {
      isDeleted: false,
      ...(base === 'REGULAR' || base === 'GAYER' ? { base } : {}),
    },
    orderBy: [{ base: 'asc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: serializeDecimals(items) });
}

// A SheetType (the "أنواع الورق" catalog entry in Settings) is 1:1 with an
// InventoryItem — every paper type needs a stock-tracked record to be
// deductible and selectable as "نوع الورق" on an order item (see
// NewOrderPage.tsx's `paperInventoryItems`, which only lists items with a
// linked sheetType). Creating one without the other left new paper types
// invisible in Orders, so both are created together, atomically.
export async function createSheetType(req: Request, res: Response) {
  const input = createSheetTypeSchema.parse(req.body);
  const created = await prisma.$transaction(async (tx) => {
    const sheetType = await tx.sheetType.create({ data: input });
    await tx.inventoryItem.create({
      data: { category: 'PAPER', name: sheetType.name, unit: sheetType.unit, sheetTypeId: sheetType.id },
    });
    return sheetType;
  });
  res.status(201).json({ success: true, data: serializeDecimals(created) });
}

export async function updateSheetType(req: Request<{ id: string }>, res: Response) {
  const input = updateSheetTypeSchema.parse(req.body);
  const updated = await prisma.$transaction(async (tx) => {
    const sheetType = await tx.sheetType.update({ where: { id: req.params.id }, data: input });
    if (input.name !== undefined || input.unit !== undefined) {
      await tx.inventoryItem.updateMany({
        where: { sheetTypeId: sheetType.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.unit !== undefined ? { unit: input.unit } : {}),
        },
      });
    }
    return sheetType;
  });
  res.json({ success: true, data: serializeDecimals(updated) });
}

// Soft delete per Requirement 12 — deletedBy is left null until Phase 2 auth
// middleware provides an authenticated staff id to attribute the deletion to.
// The linked InventoryItem is soft-deleted along with it (same transaction)
// — otherwise a "deleted" paper type stays selectable in Orders and visible
// in the Inventory list, since nothing else filters on the SheetType side.
export async function deleteSheetType(req: Request<{ id: string }>, res: Response) {
  const deleted = await prisma.$transaction(async (tx) => {
    const sheetType = await tx.sheetType.update({
      where: { id: req.params.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    await tx.inventoryItem.updateMany({
      where: { sheetTypeId: sheetType.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return sheetType;
  });
  res.json({ success: true, data: serializeDecimals(deleted) });
}
