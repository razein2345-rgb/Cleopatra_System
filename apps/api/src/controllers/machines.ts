import type { Request, Response } from 'express';
import { createMachineSchema, updateMachineSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { recordAudit } from '../services/auditService.js';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';

// system_specifications_v2.md §6.5.1/§16.1 (2026-08-16) — a lightweight
// name/branch/department/status catalog for the Production Board Overview's
// "حالة كل ماكينة" line. Deliberately no Capacity Rate/Scheduled-Hours
// fields — that's §16.1's separate Smart Decision Engine, not part of this.
//
// Owner decision (2026-09-25, found in the read-only access review) — the
// three writes below used to run for any id/branchId with no branch check and
// no audit row. Access is now checked against the MACHINE's own branch (and
// the destination too when an edit moves it), never the caller's home branch,
// and every write is audited under the machine's real branch. Reads
// (`listMachines`) are unchanged.

async function loadMachineBranchOr404(id: string, res: Response): Promise<{ branchId: string; name: string; status: string } | null> {
  const machine = await prisma.machine.findUnique({ where: { id }, select: { branchId: true, name: true, status: true, isDeleted: true } });
  if (!machine || machine.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'الماكينة غير موجودة' } });
    return null;
  }
  return machine;
}

export async function listMachines(req: Request, res: Response) {
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const machines = await prisma.machine.findMany({
    where: { isDeleted: false, ...(branchId ? { branchId } : {}) },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: machines });
}

export async function createMachine(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createMachineSchema.parse(req.body);
  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }
  const created = await prisma.machine.create({ data: input });
  await recordAudit({
    entityType: 'Machine',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: created.branchId,
    newValue: { name: created.name, status: created.status, departmentId: created.departmentId },
  });
  res.status(201).json({ success: true, data: created });
}

export async function updateMachine(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateMachineSchema.parse(req.body);
  const existing = await loadMachineBranchOr404(req.params.id, res);
  if (!existing) return;
  if (!canAccessBranch(auth, existing.branchId) || (input.branchId !== undefined && !canAccessBranch(auth, input.branchId))) {
    forbidBranch(res);
    return;
  }
  const updated = await prisma.machine.update({ where: { id: req.params.id }, data: input });
  await recordAudit({
    entityType: 'Machine',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: existing.branchId,
    previousValue: { name: existing.name, status: existing.status, branchId: existing.branchId },
    newValue: input,
  });
  res.json({ success: true, data: updated });
}

export async function deleteMachine(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadMachineBranchOr404(req.params.id, res);
  if (!existing) return;
  if (!canAccessBranch(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }
  const deleted = await prisma.machine.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
  });
  await recordAudit({
    entityType: 'Machine',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: existing.branchId,
    previousValue: { name: existing.name, status: existing.status },
  });
  res.json({ success: true, data: deleted });
}
