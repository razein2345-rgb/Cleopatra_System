import type { Request, Response } from 'express';
import { createBranchSchema, updateBranchSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

const BRANCH_SELECT = { id: true, name: true, code: true, address: true, isDefault: true };

/**
 * Read-only, requireAuth-only (no specific permission) — branch name/code is
 * low-sensitivity reference data needed by several screens (user branch
 * assignment, branch-access grants) regardless of what else a user can do.
 */
export async function listBranches(_req: Request, res: Response) {
  const branches = await prisma.branch.findMany({
    where: { isDeleted: false },
    select: BRANCH_SELECT,
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: branches });
}

/**
 * FEATURE-007 — branch management (owner, 2026-08-12). Gated on
 * `settings.edit`, same convention as every other Settings catalog
 * (Service/ReadyProduct/SheetType) — no dedicated `branches.create`
 * permission invented for this.
 */
export async function createBranch(req: Request, res: Response) {
  const input = createBranchSchema.parse(req.body);
  const created = await prisma.branch.create({
    data: { name: input.name, code: input.code, address: input.address ?? null },
    select: BRANCH_SELECT,
  });
  res.status(201).json({ success: true, data: created });
}

export async function updateBranch(req: Request<{ id: string }>, res: Response) {
  const input = updateBranchSchema.parse(req.body);
  const updated = await prisma.branch.update({
    where: { id: req.params.id },
    data: input,
    select: BRANCH_SELECT,
  });
  res.json({ success: true, data: updated });
}
