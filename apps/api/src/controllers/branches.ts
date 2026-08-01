import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

/**
 * Read-only, requireAuth-only (no specific permission) — branch name/code is
 * low-sensitivity reference data needed by several screens (user branch
 * assignment, branch-access grants) regardless of what else a user can do.
 * Full branch management (create/rename branches) is out of scope for
 * Phase 2 — only one branch exists today (see MIGRATION_PLAN.md).
 */
export async function listBranches(_req: Request, res: Response) {
  const branches = await prisma.branch.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, code: true, isDefault: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: branches });
}
