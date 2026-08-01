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

export async function createSheetType(req: Request, res: Response) {
  const input = createSheetTypeSchema.parse(req.body);
  const created = await prisma.sheetType.create({ data: input });
  res.status(201).json({ success: true, data: serializeDecimals(created) });
}

export async function updateSheetType(req: Request<{ id: string }>, res: Response) {
  const input = updateSheetTypeSchema.parse(req.body);
  const updated = await prisma.sheetType.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: serializeDecimals(updated) });
}

// Soft delete per Requirement 12 — deletedBy is left null until Phase 2 auth
// middleware provides an authenticated staff id to attribute the deletion to.
export async function deleteSheetType(req: Request<{ id: string }>, res: Response) {
  const deleted = await prisma.sheetType.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  res.json({ success: true, data: serializeDecimals(deleted) });
}
