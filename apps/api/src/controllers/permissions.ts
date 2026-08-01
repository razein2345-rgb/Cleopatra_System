import type { Request, Response } from 'express';
import { createPermissionSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { recordAudit } from '../services/auditService.js';

export async function listPermissions(req: Request, res: Response) {
  const module = typeof req.query.module === 'string' ? req.query.module : undefined;
  const permissions = await prisma.permission.findMany({
    where: module ? { module } : undefined,
    orderBy: [{ module: 'asc' }, { key: 'asc' }],
  });
  res.json({ success: true, data: permissions });
}

/** Extensibility hatch for future modules — most permissions are seeded (ADR 0022), but new feature work can register new keys here rather than requiring a seed-script change. */
export async function createPermission(req: Request, res: Response) {
  const input = createPermissionSchema.parse(req.body);
  const permission = await prisma.permission.create({
    data: {
      key: input.key,
      module: input.module,
      label: input.label,
      description: input.description,
      isSystem: false,
    },
  });

  await recordAudit({
    entityType: 'Permission',
    entityId: permission.id,
    action: 'CREATE',
    performedById: req.auth!.staffId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: permission });
}

/** System permissions (seeded, checked by real `requirePermission()` calls in code) cannot be deleted — removing one out from under a live check would silently lock everyone out of that action. */
export async function deletePermission(req: Request<{ id: string }>, res: Response) {
  const existing = await prisma.permission.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ success: false, error: { message: 'Permission not found' } });
    return;
  }
  if (existing.isSystem) {
    res.status(409).json({
      success: false,
      error: { message: 'System permissions cannot be deleted', code: 'SYSTEM_PERMISSION' },
    });
    return;
  }

  await prisma.permission.delete({ where: { id: req.params.id } });

  await recordAudit({
    entityType: 'Permission',
    entityId: existing.id,
    action: 'DELETE',
    performedById: req.auth!.staffId,
  });

  res.status(204).send();
}
