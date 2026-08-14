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

export async function listAttendanceForStaffHandler(req: Request<{ staffId: string }>, res: Response) {
  const entries = await listAttendanceForStaff(req.params.staffId);
  res.json({ success: true, data: entries });
}

export async function upsertAttendanceEntryHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = upsertAttendanceEntrySchema.parse(req.body);
  const entry = await upsertAttendanceEntry(input, auth.staffId);
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
