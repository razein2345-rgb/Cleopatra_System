import type { Request, Response } from 'express';
import { createReadyProductSchema, updateReadyProductSchema, type ReadyProduct } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { serializeDecimals } from '../utils/serialize.js';
import { rejectCostPriceWrite, stripCostPrice, stripCostPriceList } from '../lib/costPriceGuard.js';

export async function listReadyProducts(req: Request, res: Response) {
  const items = await prisma.readyProduct.findMany({
    where: { isDeleted: false },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: stripCostPriceList(serializeDecimals(items) as unknown as ReadyProduct[], req.auth!) });
}

export async function createReadyProduct(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createReadyProductSchema.parse(req.body);
  if (rejectCostPriceWrite(input, auth, res)) return;
  const created = await prisma.readyProduct.create({ data: input });
  res.status(201).json({ success: true, data: stripCostPrice(serializeDecimals(created) as unknown as ReadyProduct, auth) });
}

export async function updateReadyProduct(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateReadyProductSchema.parse(req.body);
  if (rejectCostPriceWrite(input, auth, res)) return;
  const updated = await prisma.readyProduct.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: stripCostPrice(serializeDecimals(updated) as unknown as ReadyProduct, auth) });
}

export async function deleteReadyProduct(req: Request<{ id: string }>, res: Response) {
  const deleted = await prisma.readyProduct.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  res.json({ success: true, data: serializeDecimals(deleted) });
}
