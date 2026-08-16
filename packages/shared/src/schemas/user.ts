import { z } from 'zod';
import { roleSchema } from './role.js';

/** FEATURE-008 (2026-08-13, owner: "منهم من يقبض بالأسبوع ومنهم من يقبض بالشهر") — which cycle `User.baseSalary` is denominated in. */
export const payFrequencySchema = z.enum(['WEEKLY', 'MONTHLY']);

/** "HH:MM", 24h. */
const shiftTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'صيغة الوقت غير صحيحة (HH:MM)');

/** 0 = Sunday … 6 = Saturday, matching `Date.getUTCDay()`. */
const weekdaySchema = z.number().int().min(0).max(6);

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
  shiftStartTime: z.string().nullable(),
  shiftEndTime: z.string().nullable(),
  workingDays: z.array(weekdaySchema),
  createdAt: z.string(),
});

/**
 * FEATURE-015 (2026-08-16, owner: "عايز انا اللي ادخل الموظفين بنفسي واعملهم
 * باسوورد وID بدل موضوع الإيميل ده") — most employees have no real email, so
 * the owner assigns a short login ID + password directly instead of an
 * email-invite link. Still a normal Supabase email-based account under the
 * hood (`buildInternalLoginEmail` appends a fixed internal domain neither
 * side ever needs to type in full) — `loginId` alone is what's typed at
 * both creation and login (see AuthContext.signIn's matching logic).
 */
export const INTERNAL_LOGIN_DOMAIN = 'cleopatra.local';

export const loginIdSchema = z
  .string()
  .trim()
  .min(2, 'المعرّف قصير جدًا')
  .max(30, 'المعرّف طويل جدًا')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'المعرّف يجب أن يحتوي على حروف/أرقام إنجليزية فقط، بدون مسافات')
  // A purely numeric ID shaped like an Egyptian mobile number (e.g.
  // "01012345678") would be indistinguishable from a phone login at
  // sign-in time (see AuthContext.signIn's isPhone check) — requiring at
  // least one letter keeps every loginId unambiguous.
  .regex(/[a-zA-Z]/, 'المعرّف لازم يحتوي على حرف واحد على الأقل (مش أرقام بس)');

export function buildInternalLoginEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@${INTERNAL_LOGIN_DOMAIN}`;
}

export const createUserSchema = z.object({
  name: z.string().min(1),
  loginId: loginIdSchema,
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  phone: z.string().optional(),
  branchId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()).min(1, 'Assign at least one role'),
});

export const setUserPasswordSchema = z.object({
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
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
  shiftStartTime: shiftTimeSchema.nullable().optional(),
  shiftEndTime: shiftTimeSchema.nullable().optional(),
  workingDays: z.array(weekdaySchema).optional(),
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
export type SetUserPasswordInput = z.infer<typeof setUserPasswordSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;
export type SetUserBranchAccessInput = z.infer<typeof setUserBranchAccessSchema>;
