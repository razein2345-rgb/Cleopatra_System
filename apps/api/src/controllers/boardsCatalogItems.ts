import type { Request, Response } from 'express';
import { createBoardsCatalogItemSchema, updateBoardsCatalogItemSchema, type BoardsCatalogItem } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { serializeDecimals } from '../utils/serialize.js';
import { rejectSupplierCostWrite, stripSupplierCost, stripSupplierCostList } from '../lib/costPriceGuard.js';

export async function listBoardsCatalogItems(req: Request, res: Response) {
  const items = await prisma.boardsCatalogItem.findMany({
    where: { isDeleted: false },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: stripSupplierCostList(serializeDecimals(items) as unknown as BoardsCatalogItem[], req.auth!) });
}

export async function createBoardsCatalogItem(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createBoardsCatalogItemSchema.parse(req.body);
  if (rejectSupplierCostWrite(input, auth, res)) return;
  const created = await prisma.boardsCatalogItem.create({ data: input });
  res.status(201).json({ success: true, data: stripSupplierCost(serializeDecimals(created) as unknown as BoardsCatalogItem, auth) });
}

export async function updateBoardsCatalogItem(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateBoardsCatalogItemSchema.parse(req.body);
  if (rejectSupplierCostWrite(input, auth, res)) return;
  const updated = await prisma.boardsCatalogItem.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: stripSupplierCost(serializeDecimals(updated) as unknown as BoardsCatalogItem, auth) });
}

export async function deleteBoardsCatalogItem(req: Request<{ id: string }>, res: Response) {
  const deleted = await prisma.boardsCatalogItem.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  res.json({ success: true, data: serializeDecimals(deleted) });
}
