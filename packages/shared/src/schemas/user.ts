import { z } from 'zod';
import { roleSchema } from './role.js';

/** FEATURE-008 (2026-08-13, owner: "منهم من يقبض بالأسبوع ومنهم من يقبض بالشهر") — which cycle `User.baseSalary` is denominated in. */
export const payFrequencySchema = z.enum(['WEEKLY', 'MONTHLY']);

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
  // FEATURE-008 — HR fields layered onto the existing IAM user record.
  position: z.string().nullable(),
  hireDate: z.string().nullable(),
  payFrequency: payFrequencySchema.nullable(),
  baseSalary: z.number().nullable(),
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
  position: z.string().trim().min(1).nullable().optional(),
  hireDate: z.string().nullable().optional(),
  payFrequency: payFrequencySchema.nullable().optional(),
  baseSalary: z.number().nonnegative().nullable().optional(),
});

export const setUserRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, 'Assign at least one role'),
});

export const setUserBranchAccessSchema = z.object({
  branchIds: z.array(z.string().uuid()),
});

export type PayFrequency = z.infer<typeof payFrequencySchema>;
export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;
export type SetUserBranchAccessInput = z.infer<typeof setUserBranchAccessSchema>;
