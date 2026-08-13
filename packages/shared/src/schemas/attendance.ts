import { z } from 'zod';

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

export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;
export type UpsertAttendanceEntryInput = z.infer<typeof upsertAttendanceEntrySchema>;
