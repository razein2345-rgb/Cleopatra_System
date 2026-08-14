import { z } from 'zod';

/**
 * FEATURE-013 (2026-08-14) — how a check-in/check-out actually happened.
 * SELF_SERVICE is the original (and still default) behavior; KIOSK is the
 * shared-device+PIN flow for a multi-employee branch; GPS is a location-
 * confirmed check-in for staff sent to an external site before the office;
 * MANUAL is an admin correction (unchanged, still `upsertAttendanceEntry`).
 */
export const attendanceSourceSchema = z.enum(['SELF_SERVICE', 'KIOSK', 'GPS', 'MANUAL']);

/**
 * FEATURE-008 (2026-08-13, owner: "هل قسم الموظفين هيبقى مربوط بجهاز
 * البصمة (لسه مجبتهوش) ولا في بديل"). A software check-in/check-out
 * alternative until a fingerprint device is bought — one row per (staff,
 * calendar day). Self-service (`POST /check-in`, `/check-out`) needs only
 * `requireAuth`, not `employees.*` — any staff member checks themself in,
 * not just HR/admin. Viewing/correcting someone else's attendance is what
 * `employees.view`/`employees.edit` gate.
 */
export const attendanceEntrySchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  date: z.string(),
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
  note: z.string().nullable(),
  source: attendanceSourceSchema,
  // FEATURE-013 — populated only when source = GPS.
  checkInLatitude: z.number().nullable(),
  checkInLongitude: z.number().nullable(),
  recordedById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Admin manual entry/correction (`employees.edit`) — e.g. backfilling a day someone forgot to check in/out on. */
export const upsertAttendanceEntrySchema = z.object({
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  date: z.string(),
  checkInAt: z.string().nullable().optional(),
  checkOutAt: z.string().nullable().optional(),
  note: z.string().trim().min(1).max(500).nullable().optional(),
});

/**
 * FEATURE-013 (2026-08-14, owner: "الموظف يكتب اسمه ورقمه السري") — the
 * Kiosk device sends the typed name + PIN; the server resolves which
 * StaffProfile that is (scoped to the device's own branch only) and
 * verifies the PIN server-side — the device never learns any `staffId`s.
 */
export const kioskCheckInSchema = z.object({
  name: z.string().trim().min(1).max(200),
  pin: z.string().trim().regex(/^\d{4}$/, 'الرقم السري 4 أرقام'),
});

/** `employees.edit` — set or change a staff member's Kiosk PIN. Never returned back once set. */
export const setAttendancePinSchema = z.object({
  pin: z.string().trim().regex(/^\d{4}$/, 'الرقم السري 4 أرقام'),
});

export const fieldAssignmentStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']);

/**
 * FEATURE-013 (2026-08-14, owner: "بيكون في حد انا مكلفه يروح مكان معين
 * قبل ما يجي") — a staff member assigned to visit a specific location
 * before coming to the office; confirming it by GPS proximity records
 * today's `AttendanceEntry` (`source: 'GPS'`).
 */
export const fieldAssignmentSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  date: z.string(),
  locationLabel: z.string(),
  targetLatitude: z.number(),
  targetLongitude: z.number(),
  radiusMeters: z.number().int(),
  status: fieldAssignmentStatusSchema,
  confirmedAt: z.string().nullable(),
  createdById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** `employees.edit` — the owner picks the target location on a map (`LocationPickerMap`), which fills lat/long. */
export const createFieldAssignmentSchema = z.object({
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  date: z.string(),
  locationLabel: z.string().trim().min(1).max(300),
  targetLatitude: z.number().min(-90).max(90),
  targetLongitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().positive().optional(),
});

/** Self-service — the assigned employee's own "تأكيد وصولي" action, browser-captured coordinates. */
export const confirmFieldAssignmentSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type AttendanceSource = z.infer<typeof attendanceSourceSchema>;
export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;
export type UpsertAttendanceEntryInput = z.infer<typeof upsertAttendanceEntrySchema>;
export type KioskCheckInInput = z.infer<typeof kioskCheckInSchema>;
export type SetAttendancePinInput = z.infer<typeof setAttendancePinSchema>;
export type FieldAssignmentStatus = z.infer<typeof fieldAssignmentStatusSchema>;
export type FieldAssignment = z.infer<typeof fieldAssignmentSchema>;
export type CreateFieldAssignmentInput = z.infer<typeof createFieldAssignmentSchema>;
export type ConfirmFieldAssignmentInput = z.infer<typeof confirmFieldAssignmentSchema>;
