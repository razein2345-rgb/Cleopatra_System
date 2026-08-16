import type { Request, Response } from 'express';
import { createMachineSchema, updateMachineSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

// system_specifications_v2.md §6.5.1/§16.1 (2026-08-16) — a lightweight
// name/branch/department/status catalog for the Production Board Overview's
// "حالة كل ماكينة" line. Deliberately no Capacity Rate/Scheduled-Hours
// fields — that's §16.1's separate Smart Decision Engine, not part of this.

export async function listMachines(req: Request, res: Response) {
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const machines = await prisma.machine.findMany({
    where: { isDeleted: false, ...(branchId ? { branchId } : {}) },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: machines });
}

export async function createMachine(req: Request, res: Response) {
  const input = createMachineSchema.parse(req.body);
  const created = await prisma.machine.create({ data: input });
  res.status(201).json({ success: true, data: created });
}

export async function updateMachine(req: Request<{ id: string }>, res: Response) {
  const input = updateMachineSchema.parse(req.body);
  const updated = await prisma.machine.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: updated });
}

export async function deleteMachine(req: Request<{ id: string }>, res: Response) {
  const deleted = await prisma.machine.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: req.auth?.staffId ?? null },
  });
  res.json({ success: true, data: deleted });
}
