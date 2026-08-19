import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  checkInHandler,
  checkOutHandler,
  confirmFieldAssignmentHandler,
  createFieldAssignmentHandler,
  deleteFieldAssignmentHandler,
  getKioskStaffHandler,
  getMyTodayAttendanceHandler,
  kioskSubmitHandler,
  listAttendanceForStaffHandler,
  listFieldAssignmentsHandler,
  myTodayFieldAssignmentsHandler,
  upsertAttendanceEntryHandler,
} from '../controllers/attendance.js';

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth);

// Self-service — any authenticated staff member, no employees.* permission needed.
attendanceRouter.get('/my-today', getMyTodayAttendanceHandler);
attendanceRouter.post('/check-in', checkInHandler);
attendanceRouter.post('/check-out', checkOutHandler);

// Viewing/correcting someone else's attendance is an HR action.
attendanceRouter.get('/staff/:staffId', requirePermission('employees.view'), listAttendanceForStaffHandler);
attendanceRouter.post('/', requirePermission('employees.edit'), upsertAttendanceEntryHandler);

// FEATURE-013 (2026-08-14) — Kiosk (فرع كليوباترا): the device itself is a
// real, logged-in StaffProfile whose only grant is `attendance.kiosk` —
// never a regular employee's own login, and never any broader permission.
attendanceRouter.get('/kiosk/staff', requirePermission('attendance.kiosk'), getKioskStaffHandler);
attendanceRouter.post('/kiosk/submit', requirePermission('attendance.kiosk'), kioskSubmitHandler);

// FEATURE-013 — GPS field-assignment confirmation. Self-service to view/confirm your own; employees.edit to assign one.
attendanceRouter.get('/field-assignments/my-today', myTodayFieldAssignmentsHandler);
attendanceRouter.post('/field-assignments/:id/confirm', confirmFieldAssignmentHandler);
attendanceRouter.get('/field-assignments', requirePermission('employees.edit'), listFieldAssignmentsHandler);
attendanceRouter.post('/field-assignments', requirePermission('employees.edit'), createFieldAssignmentHandler);
attendanceRouter.delete('/field-assignments/:id', requirePermission('employees.edit'), deleteFieldAssignmentHandler);
