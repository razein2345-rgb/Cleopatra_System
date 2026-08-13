import { prisma } from '../lib/prisma.js';
import type { AttendanceEntry, UpsertAttendanceEntryInput } from '@cleopatra/shared';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * FEATURE-008 — software check-in/check-out (see attendance.ts's doc
 * comment for the "no device yet" rationale). `date` is always normalized
 * to UTC midnight of the calendar day, matching every other date-only
 * field in this codebase (e.g. Order.deliveryDate) and the
 * `@@unique([staffId, date])` constraint's own semantics.
 */

type AttendanceRecord = Prisma.AttendanceEntryGetPayload<object>;

function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function mapAttendanceToDto(entry: AttendanceRecord): AttendanceEntry {
  return {
    id: entry.id,
    staffId: entry.staffId,
    branchId: entry.branchId,
    date: entry.date.toISOString(),
    checkInAt: entry.checkInAt ? entry.checkInAt.toISOString() : null,
    checkOutAt: entry.checkOutAt ? entry.checkOutAt.toISOString() : null,
    note: entry.note,
    recordedById: entry.recordedById,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export class AlreadyCheckedInError extends Error {
  constructor() {
    super('تم تسجيل الحضور بالفعل اليوم');
    this.name = 'AlreadyCheckedInError';
  }
}

export class NotCheckedInError extends Error {
  constructor() {
    super('لم يتم تسجيل الحضور اليوم بعد');
    this.name = 'NotCheckedInError';
  }
}

export class AlreadyCheckedOutError extends Error {
  constructor() {
    super('تم تسجيل الانصراف بالفعل اليوم');
    this.name = 'AlreadyCheckedOutError';
  }
}

export async function getTodayEntryForStaff(staffId: string): Promise<AttendanceEntry | null> {
  const entry = await prisma.attendanceEntry.findUnique({
    where: { staffId_date: { staffId, date: todayUtcMidnight() } },
  });
  return entry ? mapAttendanceToDto(entry) : null;
}

export async function checkIn(staffId: string, branchId: string, recordedById: string): Promise<AttendanceEntry> {
  const date = todayUtcMidnight();
  const existing = await prisma.attendanceEntry.findUnique({ where: { staffId_date: { staffId, date } } });
  if (existing?.checkInAt) {
    throw new AlreadyCheckedInError();
  }

  const entry = existing
    ? await prisma.attendanceEntry.update({ where: { id: existing.id }, data: { checkInAt: new Date() } })
    : await prisma.attendanceEntry.create({
        data: { staffId, branchId, date, checkInAt: new Date(), recordedById },
      });
  return mapAttendanceToDto(entry);
}

export async function checkOut(staffId: string): Promise<AttendanceEntry> {
  const date = todayUtcMidnight();
  const existing = await prisma.attendanceEntry.findUnique({ where: { staffId_date: { staffId, date } } });
  if (!existing?.checkInAt) {
    throw new NotCheckedInError();
  }
  if (existing.checkOutAt) {
    throw new AlreadyCheckedOutError();
  }

  const entry = await prisma.attendanceEntry.update({ where: { id: existing.id }, data: { checkOutAt: new Date() } });
  return mapAttendanceToDto(entry);
}

export async function listAttendanceForStaff(staffId: string, limit = 30): Promise<AttendanceEntry[]> {
  const entries = await prisma.attendanceEntry.findMany({
    where: { staffId, isDeleted: false },
    orderBy: { date: 'desc' },
    take: limit,
  });
  return entries.map(mapAttendanceToDto);
}

/** Admin manual entry/correction (employees.edit) — upserts by (staffId, date). */
export async function upsertAttendanceEntry(input: UpsertAttendanceEntryInput, recordedById: string): Promise<AttendanceEntry> {
  const date = new Date(input.date);
  const entry = await prisma.attendanceEntry.upsert({
    where: { staffId_date: { staffId: input.staffId, date } },
    create: {
      staffId: input.staffId,
      branchId: input.branchId,
      date,
      checkInAt: input.checkInAt ? new Date(input.checkInAt) : null,
      checkOutAt: input.checkOutAt ? new Date(input.checkOutAt) : null,
      note: input.note ?? null,
      recordedById,
    },
    update: {
      checkInAt: input.checkInAt !== undefined ? (input.checkInAt ? new Date(input.checkInAt) : null) : undefined,
      checkOutAt: input.checkOutAt !== undefined ? (input.checkOutAt ? new Date(input.checkOutAt) : null) : undefined,
      note: input.note !== undefined ? input.note : undefined,
      recordedById,
    },
  });
  return mapAttendanceToDto(entry);
}
