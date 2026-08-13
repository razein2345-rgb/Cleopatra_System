import type { Request, Response } from 'express';
import { upsertAttendanceEntrySchema } from '@cleopatra/shared';
import {
  AlreadyCheckedInError,
  AlreadyCheckedOutError,
  checkIn,
  checkOut,
  getTodayEntryForStaff,
  listAttendanceForStaff,
  NotCheckedInError,
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
