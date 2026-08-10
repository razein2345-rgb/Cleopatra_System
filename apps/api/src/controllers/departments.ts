import type { Request, Response } from 'express';
import { createDepartmentSchema, updateDepartmentSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { mapDepartmentToDto } from '../services/departmentService.js';

// Department is reference data (VISION.md's Department-Based Workflow) —
// same lightweight settings-catalog CRUD pattern as SheetType/SizeFamily,
// gated on settings.*, no audit logging (matching that precedent).

export async function listDepartments(_req: Request, res: Response) {
  const items = await prisma.department.findMany({
    where: { isDeleted: false },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: items.map(mapDepartmentToDto) });
}

export async function createDepartment(req: Request, res: Response) {
  const input = createDepartmentSchema.parse(req.body);
  const created = await prisma.department.create({ data: input });
  res.status(201).json({ success: true, data: mapDepartmentToDto(created) });
}

export async function updateDepartment(req: Request<{ id: string }>, res: Response) {
  const input = updateDepartmentSchema.parse(req.body);
  const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Department not found' } });
    return;
  }
  const updated = await prisma.department.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: mapDepartmentToDto(updated) });
}

export async function deleteDepartment(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Department not found' } });
    return;
  }
  const deleted = await prisma.department.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
  });
  res.json({ success: true, data: { id: deleted.id } });
}
