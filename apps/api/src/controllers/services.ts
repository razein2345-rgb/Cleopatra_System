import type { Request, Response } from 'express';
import { createServiceSchema, updateServiceSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { serializeDecimals } from '../utils/serialize.js';

export async function listServices(req: Request, res: Response) {
  const category =
    typeof req.query.category === 'string' ? req.query.category.toUpperCase() : undefined;
  const items = await prisma.service.findMany({
    where: {
      isDeleted: false,
      ...(category === 'DESIGN' || category === 'MONTAGE' ? { category } : {}),
    },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: serializeDecimals(items) });
}

export async function createService(req: Request, res: Response) {
  const input = createServiceSchema.parse(req.body);
  const created = await prisma.service.create({ data: input });
  res.status(201).json({ success: true, data: serializeDecimals(created) });
}

export async function updateService(req: Request<{ id: string }>, res: Response) {
  const input = updateServiceSchema.parse(req.body);
  const updated = await prisma.service.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: serializeDecimals(updated) });
}

export async function deleteService(req: Request<{ id: string }>, res: Response) {
  const deleted = await prisma.service.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  res.json({ success: true, data: serializeDecimals(deleted) });
}
