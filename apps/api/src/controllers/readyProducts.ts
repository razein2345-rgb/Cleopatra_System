import type { Request, Response } from 'express';
import { createReadyProductSchema, updateReadyProductSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { serializeDecimals } from '../utils/serialize.js';

export async function listReadyProducts(_req: Request, res: Response) {
  const items = await prisma.readyProduct.findMany({
    where: { isDeleted: false },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: serializeDecimals(items) });
}

export async function createReadyProduct(req: Request, res: Response) {
  const input = createReadyProductSchema.parse(req.body);
  const created = await prisma.readyProduct.create({ data: input });
  res.status(201).json({ success: true, data: serializeDecimals(created) });
}

export async function updateReadyProduct(req: Request<{ id: string }>, res: Response) {
  const input = updateReadyProductSchema.parse(req.body);
  const updated = await prisma.readyProduct.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: serializeDecimals(updated) });
}

export async function deleteReadyProduct(req: Request<{ id: string }>, res: Response) {
  const deleted = await prisma.readyProduct.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  res.json({ success: true, data: serializeDecimals(deleted) });
}
