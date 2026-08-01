import type { Request, Response } from 'express';
import { createRoleSchema, setRolePermissionsSchema, updateRoleSchema } from '@cleopatra/shared';
import type { RoleWithPermissions } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { recordAudit } from '../services/auditService.js';

const roleInclude = {
  permissions: { include: { permission: true } },
} satisfies Prisma.RoleInclude;

type RoleWithGrants = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

function mapRole(role: RoleWithGrants): RoleWithPermissions {
  return {
    id: role.id,
    name: role.name,
    label: role.label,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((rp) => ({
      id: rp.permission.id,
      key: rp.permission.key,
      module: rp.permission.module,
      label: rp.permission.label,
      description: rp.permission.description,
      isSystem: rp.permission.isSystem,
    })),
  };
}

export async function listRoles(_req: Request, res: Response) {
  const roles = await prisma.role.findMany({
    where: { isDeleted: false },
    include: roleInclude,
    orderBy: { label: 'asc' },
  });
  res.json({ success: true, data: roles.map(mapRole) });
}

export async function getRole(req: Request<{ id: string }>, res: Response) {
  const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: roleInclude });
  if (!role || role.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Role not found' } });
    return;
  }
  res.json({ success: true, data: mapRole(role) });
}

export async function createRole(req: Request, res: Response) {
  const input = createRoleSchema.parse(req.body);
  const role = await prisma.role.create({
    data: { name: input.name, label: input.label, description: input.description, isSystem: false },
    include: roleInclude,
  });

  await recordAudit({
    entityType: 'Role',
    entityId: role.id,
    action: 'CREATE',
    performedById: req.auth!.staffId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: mapRole(role) });
}

export async function updateRole(req: Request<{ id: string }>, res: Response) {
  const input = updateRoleSchema.parse(req.body);
  const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Role not found' } });
    return;
  }

  const updated = await prisma.role.update({
    where: { id: req.params.id },
    data: input,
    include: roleInclude,
  });

  await recordAudit({
    entityType: 'Role',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: req.auth!.staffId,
    previousValue: { label: existing.label, description: existing.description },
    newValue: input,
  });

  res.json({ success: true, data: mapRole(updated) });
}

/** System roles (the 8 seeded defaults) cannot be deleted — only renamed or have their permission set adjusted. */
export async function deleteRole(req: Request<{ id: string }>, res: Response) {
  const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Role not found' } });
    return;
  }
  if (existing.isSystem) {
    res.status(409).json({
      success: false,
      error: { message: 'System roles cannot be deleted', code: 'SYSTEM_ROLE' },
    });
    return;
  }

  const deleted = await prisma.role.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: req.auth!.staffId },
  });

  await recordAudit({
    entityType: 'Role',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: req.auth!.staffId,
  });

  res.json({ success: true, data: { id: deleted.id } });
}

/** Replaces a role's entire permission set — the primary way an admin configures RBAC without touching code (ADR 0022). */
export async function setRolePermissions(req: Request<{ id: string }>, res: Response) {
  const input = setRolePermissionsSchema.parse(req.body);
  const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Role not found' } });
    return;
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: req.params.id } }),
    prisma.rolePermission.createMany({
      data: input.permissionIds.map((permissionId) => ({ roleId: req.params.id, permissionId })),
    }),
  ]);

  await recordAudit({
    entityType: 'Role',
    entityId: req.params.id,
    action: 'UPDATE',
    performedById: req.auth!.staffId,
    newValue: { permissionIds: input.permissionIds },
  });

  const role = await prisma.role.findUniqueOrThrow({
    where: { id: req.params.id },
    include: roleInclude,
  });
  res.json({ success: true, data: mapRole(role) });
}
