import type { Request, Response } from 'express';
import { createBoardsCatalogItemSchema, updateBoardsCatalogItemSchema, type BoardsCatalogItem } from '@cleopatra/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { serializeDecimals } from '../utils/serialize.js';
import { rejectSupplierCostWrite, stripSupplierCost, stripSupplierCostList } from '../lib/costPriceGuard.js';

const INCLUDE = {
  purchaseSupplier: { select: { nameAr: true } },
  assemblySupplier: { select: { nameAr: true } },
} satisfies Prisma.BoardsCatalogItemInclude;

type BoardsCatalogItemRecord = Prisma.BoardsCatalogItemGetPayload<{ include: typeof INCLUDE }>;

function mapToDto(row: BoardsCatalogItemRecord): BoardsCatalogItem {
  return {
    ...(serializeDecimals(row) as unknown as BoardsCatalogItem),
    purchaseSupplierName: row.purchaseSupplier?.nameAr ?? null,
    assemblySupplierName: row.assemblySupplier?.nameAr ?? null,
  };
}

export async function listBoardsCatalogItems(req: Request, res: Response) {
  const items = await prisma.boardsCatalogItem.findMany({
    where: { isDeleted: false },
    include: INCLUDE,
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: stripSupplierCostList(items.map(mapToDto), req.auth!) });
}

export async function createBoardsCatalogItem(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createBoardsCatalogItemSchema.parse(req.body);
  if (rejectSupplierCostWrite(input, auth, res)) return;
  const created = await prisma.boardsCatalogItem.create({ data: input, include: INCLUDE });
  res.status(201).json({ success: true, data: stripSupplierCost(mapToDto(created), auth) });
}

export async function updateBoardsCatalogItem(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateBoardsCatalogItemSchema.parse(req.body);
  if (rejectSupplierCostWrite(input, auth, res)) return;
  const updated = await prisma.boardsCatalogItem.update({ where: { id: req.params.id }, data: input, include: INCLUDE });
  res.json({ success: true, data: stripSupplierCost(mapToDto(updated), auth) });
}

export async function deleteBoardsCatalogItem(req: Request<{ id: string }>, res: Response) {
  const deleted = await prisma.boardsCatalogItem.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  res.json({ success: true, data: serializeDecimals(deleted) });
}
