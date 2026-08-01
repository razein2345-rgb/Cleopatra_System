import type { Request, Response } from 'express';
import {
  addSizeFamilyEntrySchema,
  createSizeFamilySchema,
  updateSizeFamilyEntrySchema,
  updateSizeFamilySchema,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { serializeDecimals } from '../utils/serialize.js';

export async function listSizeFamilies(_req: Request, res: Response) {
  const families = await prisma.sizeFamily.findMany({
    where: { isDeleted: false },
    include: { entries: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { label: 'asc' },
  });
  res.json({ success: true, data: serializeDecimals(families) });
}

export async function createSizeFamily(req: Request, res: Response) {
  const input = createSizeFamilySchema.parse(req.body);
  const created = await prisma.sizeFamily.create({ data: input, include: { entries: true } });
  res.status(201).json({ success: true, data: serializeDecimals(created) });
}

export async function updateSizeFamily(req: Request<{ id: string }>, res: Response) {
  const input = updateSizeFamilySchema.parse(req.body);
  const updated = await prisma.sizeFamily.update({
    where: { id: req.params.id },
    data: input,
    include: { entries: true },
  });
  res.json({ success: true, data: serializeDecimals(updated) });
}

// Soft delete per Requirement 12 — deletedBy left null until Phase 2 auth exists.
export async function deleteSizeFamily(req: Request<{ id: string }>, res: Response) {
  const deleted = await prisma.sizeFamily.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  res.json({ success: true, data: serializeDecimals(deleted) });
}

export async function addSizeFamilyEntry(req: Request<{ id: string }>, res: Response) {
  const input = addSizeFamilyEntrySchema.parse(req.body);
  const sortOrder = await prisma.sizeFamilyEntry.count({ where: { familyId: req.params.id } });
  const created = await prisma.sizeFamilyEntry.create({
    data: { ...input, familyId: req.params.id, sortOrder },
  });
  res.status(201).json({ success: true, data: serializeDecimals(created) });
}

export async function updateSizeFamilyEntry(
  req: Request<{ id: string; entryId: string }>,
  res: Response,
) {
  const input = updateSizeFamilyEntrySchema.parse(req.body);
  const updated = await prisma.sizeFamilyEntry.update({
    where: { id: req.params.entryId },
    data: input,
  });
  res.json({ success: true, data: serializeDecimals(updated) });
}

// NOTE: legacy protects sizes structurally relied on by the calculation
// engine (LEGACY_ANALYSIS §2/§9) from deletion. That protection depends on
// the GROUPS/REAL_SIZES constants ported verbatim in Phase 4 and is added
// once that phase lands. SizeFamilyEntry is a plain child record (see
// MIGRATION_PLAN's soft-delete policy) so this is a hard delete of a line
// item, not a business entity, matching legacy's own unprotected sizes.
export async function deleteSizeFamilyEntry(
  req: Request<{ id: string; entryId: string }>,
  res: Response,
) {
  await prisma.sizeFamilyEntry.delete({ where: { id: req.params.entryId } });
  res.status(204).send();
}
