import { z } from 'zod';
import { roleSchema } from './role.js';

export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
  branchId: z.string().uuid(),
  roles: z.array(roleSchema),
  accessibleBranchIds: z.array(z.string().uuid()),
  createdAt: z.string(),
});

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  branchId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()).min(1, 'Assign at least one role'),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  branchId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export const setUserRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, 'Assign at least one role'),
});

export const setUserBranchAccessSchema = z.object({
  branchIds: z.array(z.string().uuid()),
});

export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;
export type SetUserBranchAccessInput = z.infer<typeof setUserBranchAccessSchema>;
