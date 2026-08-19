import type { Request, Response } from 'express';
import {
  confirmFieldAssignmentSchema,
  createFieldAssignmentSchema,
  kioskCheckInSchema,
  upsertAttendanceEntrySchema,
} from '@cleopatra/shared';
import {
  AlreadyCheckedInError,
  AlreadyCheckedOutError,
  AlreadyDoneForTodayError,
  checkIn,
  checkOut,
  confirmFieldAssignmentLocation,
  createFieldAssignment,
  deleteFieldAssignment,
  FieldAssignmentNotFoundError,
  getTodayEntryForStaff,
  InvalidKioskCredentialsError,
  kioskSubmit,
  listAttendanceForStaff,
  listFieldAssignments,
  listKioskStaff,
  myTodayFieldAssignments,
  NotCheckedInError,
  TooFarFromTargetError,
  upsertAttendanceEntry,
} from '../services/attendanceService.js';
import { recordAudit } from '../services/auditService.js';

export async function getMyTodayAttendanceHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const entry = await getTodayEntryForStaff(auth.staffId);
  res.json({ success: true, data: entry });
}

export async function checkInHandler(req: Request, res: Response) {
  const auth = req.auth!;
  try {
    const entry = await checkIn(auth.staffId, auth.branchId, auth.staffId);
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    if (err instanceof AlreadyCheckedInError) {
      res.status(409).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
}

export async function checkOutHandler(req: Request, res: Response) {
  const auth = req.auth!;
  try {
    const entry = await checkOut(auth.staffId);
    res.json({ success: true, data: entry });
  } catch (err) {
    if (err instanceof NotCheckedInError || err instanceof AlreadyCheckedOutError) {
      res.status(409).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
}

/**
 * system_specifications_v2.md §3.1.1 (2026-08-16) — attendance records are
 * called out by name (alongside payroll) as sensitive enough to restrict
 * to the Super Admin account only, even for other roles that otherwise
 * hold `employees.view` (the route-level permission this endpoint still
 * requires too). A frontend-only guard (`EmployeeProfilePage.tsx`) isn't
 * enough on its own — this is the actual enforcement point.
 */
export async function listAttendanceForStaffHandler(req: Request<{ staffId: string }>, res: Response) {
  if (!req.auth!.roleNames.includes('SUPER_ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Attendance records are restricted to Super Admin' } });
    return;
  }
  const entries = await listAttendanceForStaff(req.params.staffId);
  res.json({ success: true, data: entries });
}

/**
 * system_specifications_v2.md §3.1.1 — correcting a worker's recorded
 * check-in/check-out time is the same sensitivity class as viewing it
 * (`listAttendanceForStaffHandler` above), so it gets the identical
 * explicit Super-Admin check — `employees.edit` (the route-level
 * permission this endpoint still requires) is not enough on its own,
 * since other roles hold that permission too. Owner (2026-08-17): "عايز
 * اتأكد إني أقدر أعدل... من عندي فقط."
 */
export async function upsertAttendanceEntryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  if (!auth.roleNames.includes('SUPER_ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Editing attendance records is restricted to Super Admin' } });
    return;
  }
  const input = upsertAttendanceEntrySchema.parse(req.body);
  const { entry, previous } = await upsertAttendanceEntry(input, auth.staffId);
  await recordAudit({
    entityType: 'AttendanceEntry',
    entityId: entry.id,
    action: previous ? 'UPDATE' : 'CREATE',
    performedById: auth.staffId,
    branchId: entry.branchId,
    previousValue: previous ? { checkInAt: previous.checkInAt, checkOutAt: previous.checkOutAt, note: previous.note } : null,
    newValue: { checkInAt: entry.checkInAt, checkOutAt: entry.checkOutAt, note: entry.note },
  });
  res.status(201).json({ success: true, data: entry });
}

// ---------------------------------------------------------------------------
// FEATURE-013 (2026-08-14) — Kiosk (فرع كليوباترا) + GPS field assignments.
// ---------------------------------------------------------------------------

/** The name-suggestion list the Kiosk's typed name field autocompletes against — scoped to the device's own branch only. */
export async function getKioskStaffHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const staff = await listKioskStaff(auth.branchId);
  res.json({ success: true, data: staff });
}

/**
 * The Kiosk submits `{name, pin}`; the device's own `auth.branchId` scopes
 * which staff it may resolve, and `auth.staffId` (the Kiosk device account
 * itself) is recorded as `recordedById` on a fresh check-in — never the
 * caller's own identity standing in for the employee's.
 */
export async function kioskSubmitHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = kioskCheckInSchema.parse(req.body);
  try {
    const result = await kioskSubmit(input.name, input.pin, auth.branchId, auth.staffId);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof InvalidKioskCredentialsError) {
      res.status(401).json({ success: false, error: { message: err.message } });
      return;
    }
    if (err instanceof AlreadyDoneForTodayError) {
      res.status(409).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
}

export async function myTodayFieldAssignmentsHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const assignments = await myTodayFieldAssignments(auth.staffId);
  res.json({ success: true, data: assignments });
}

/** Self-service — the assigned employee's own "تأكيد وصولي" action. */
export async function confirmFieldAssignmentHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = confirmFieldAssignmentSchema.parse(req.body);
  try {
    const assignment = await confirmFieldAssignmentLocation(req.params.id, auth.staffId, input);
    res.json({ success: true, data: assignment });
  } catch (err) {
    if (err instanceof FieldAssignmentNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    if (err instanceof TooFarFromTargetError) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'TOO_FAR', distanceMeters: err.distanceMeters },
      });
      return;
    }
    throw err;
  }
}

/** `employees.edit` — the owner assigning a staff member a location for a given day. */
export async function createFieldAssignmentHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createFieldAssignmentSchema.parse(req.body);
  const assignment = await createFieldAssignment(input, auth.staffId);
  res.status(201).json({ success: true, data: assignment });
}

export async function listFieldAssignmentsHandler(req: Request, res: Response) {
  const staffId = typeof req.query.staffId === 'string' ? req.query.staffId : undefined;
  const assignments = await listFieldAssignments(staffId);
  res.json({ success: true, data: assignments });
}

/** Owner (2026-08-19, "أقدر أحذف المهمة دي من عند الموظف؟") — same `employees.edit` weight as creating one. */
export async function deleteFieldAssignmentHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  let result;
  try {
    result = await deleteFieldAssignment(req.params.id, auth.staffId);
  } catch (err) {
    if (err instanceof FieldAssignmentNotFoundError) {
      res.status(404).json({ success: false, error: { message: err.message } });
      return;
    }
    throw err;
  }
  await recordAudit({
    entityType: 'FieldAssignment',
    entityId: req.params.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: result.branchId,
    newValue: null,
  });
  res.json({ success: true, data: { id: req.params.id } });
}
