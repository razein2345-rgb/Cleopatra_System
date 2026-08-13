import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  checkInHandler,
  checkOutHandler,
  getMyTodayAttendanceHandler,
  listAttendanceForStaffHandler,
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
