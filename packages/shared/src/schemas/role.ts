import { z } from 'zod';
import { permissionSchema } from './permission.js';

export const roleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable(),
  isSystem: z.boolean(),
});

export const roleWithPermissionsSchema = roleSchema.extend({
  permissions: z.array(permissionSchema),
});

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Role name must be UPPER_SNAKE_CASE'),
  label: z.string().min(1),
  description: z.string().optional(),
});

export const updateRoleSchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

export const setRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()),
});

export type Role = z.infer<typeof roleSchema>;
export type RoleWithPermissions = z.infer<typeof roleWithPermissionsSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;
