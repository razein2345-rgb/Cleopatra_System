import { z } from 'zod';

/** Mirrors Prisma's `DeviceStatus` enum exactly — see `apps/api/prisma/schema.prisma`. */
export const deviceStatusSchema = z.enum(['PENDING', 'ACTIVE', 'BLOCKED']);

/** `Setting.deviceAccessMode` — see its own doc comment in `schema.prisma`. */
export const deviceAccessModeSchema = z.enum(['ALLOW_ALL_REGISTERED', 'ONLY_APPROVED']);

export const trustedDeviceSchema = z.object({
  id: z.string().uuid(),
  label: z.string().nullable(),
  staffId: z.string().uuid().nullable(),
  staffName: z.string().nullable(),
  status: deviceStatusSchema,
  deviceType: z.string().nullable(),
  os: z.string().nullable(),
  browser: z.string().nullable(),
  firstSeenAt: z.string(),
  lastLoginAt: z.string().nullable(),
  lastActiveAt: z.string().nullable(),
  approvedById: z.string().uuid().nullable(),
  approvedAt: z.string().nullable(),
  blockedById: z.string().uuid().nullable(),
  blockedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** Rename the device and/or change its Policy B owner (`staffId: null` switches it to Policy A). */
export const updateTrustedDeviceSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  staffId: z.string().uuid().nullable().optional(),
});

export type DeviceStatus = z.infer<typeof deviceStatusSchema>;
export type DeviceAccessMode = z.infer<typeof deviceAccessModeSchema>;
export type TrustedDevice = z.infer<typeof trustedDeviceSchema>;
export type UpdateTrustedDeviceInput = z.infer<typeof updateTrustedDeviceSchema>;
