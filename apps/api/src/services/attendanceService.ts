import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import type {
  AttendanceEntry,
  AttendanceSource,
  ConfirmFieldAssignmentInput,
  CreateFieldAssignmentInput,
  FieldAssignment,
  UpsertAttendanceEntryInput,
} from '@cleopatra/shared';
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
    source: entry.source,
    checkInLatitude: entry.checkInLatitude,
    checkInLongitude: entry.checkInLongitude,
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

/**
 * FEATURE-013 (2026-08-14) — `source`/`latitude`/`longitude` are additive
 * and optional: self-service (the original caller) never passes them and
 * keeps behaving exactly as before (`source` defaults to SELF_SERVICE at
 * the database level). The Kiosk and GPS-confirmation flows are the only
 * callers that pass `source`, reusing this exact function rather than
 * duplicating the create-or-update-today's-row logic a second time.
 */
export async function checkIn(
  staffId: string,
  branchId: string,
  recordedById: string,
  options?: { source?: AttendanceSource; latitude?: number; longitude?: number },
): Promise<AttendanceEntry> {
  const date = todayUtcMidnight();
  const existing = await prisma.attendanceEntry.findUnique({ where: { staffId_date: { staffId, date } } });
  if (existing?.checkInAt) {
    throw new AlreadyCheckedInError();
  }

  const checkInFields = {
    checkInAt: new Date(),
    source: options?.source,
    checkInLatitude: options?.latitude ?? null,
    checkInLongitude: options?.longitude ?? null,
  };
  const entry = existing
    ? await prisma.attendanceEntry.update({ where: { id: existing.id }, data: checkInFields })
    : await prisma.attendanceEntry.create({
        data: { staffId, branchId, date, recordedById, ...checkInFields },
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

/**
 * Admin manual entry/correction (Super Admin only — see attendance.ts's
 * own doc comment on why this is restricted beyond `employees.edit`) —
 * upserts by (staffId, date). Returns the pre-edit state alongside the
 * result so the caller can record a real before/after audit entry, not
 * just "something changed."
 */
export async function upsertAttendanceEntry(
  input: UpsertAttendanceEntryInput,
  recordedById: string,
): Promise<{ entry: AttendanceEntry; previous: AttendanceEntry | null }> {
  const date = new Date(input.date);
  const existing = await prisma.attendanceEntry.findUnique({ where: { staffId_date: { staffId: input.staffId, date } } });
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
  return { entry: mapAttendanceToDto(entry), previous: existing ? mapAttendanceToDto(existing) : null };
}

// ---------------------------------------------------------------------------
// FEATURE-013 (2026-08-14) — Kiosk PIN (فرع كليوباترا) + GPS field-assignment
// confirmation. See attendance.ts's doc comments for the owner conversation
// behind both.
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 32;

/** `crypto.scryptSync` + a per-user random salt — no new hashing dependency for a 4-digit PIN. */
function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

/** Constant-time compare (`timingSafeEqual`) — a 4-digit PIN is low-entropy, no reason to leak timing on top of that. */
function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function setAttendancePin(staffId: string, pin: string): Promise<void> {
  await prisma.staffProfile.update({ where: { id: staffId }, data: { attendancePinHash: hashPin(pin) } });
}

export class InvalidKioskCredentialsError extends Error {
  constructor() {
    super('الاسم أو الرقم السري غير صحيح');
    this.name = 'InvalidKioskCredentialsError';
  }
}

export class AlreadyDoneForTodayError extends Error {
  constructor() {
    super('تم تسجيل الحضور والانصراف بالفعل اليوم');
    this.name = 'AlreadyDoneForTodayError';
  }
}

/** For the Kiosk's name field's live-suggestion list — never exposes anything beyond id/name, and only within the device's own branch. */
export async function listKioskStaff(branchId: string): Promise<{ id: string; name: string }[]> {
  const staff = await prisma.staffProfile.findMany({
    where: { branchId, isActive: true, isDeleted: false, attendancePinHash: { not: null } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return staff;
}

/**
 * FEATURE-013 (owner: "الموظف يكتب اسمه ورقمه السري") — resolves the typed
 * name to a StaffProfile *scoped to the Kiosk device's own branch only*,
 * verifies the PIN, then decides check-in vs check-out from today's own
 * entry (the Kiosk never asks the employee which one they want) and reuses
 * `checkIn`/`checkOut` with `source: 'KIOSK'`.
 */
export async function kioskSubmit(
  name: string,
  pin: string,
  branchId: string,
  deviceStaffId: string,
): Promise<{ action: 'CHECK_IN' | 'CHECK_OUT'; staffName: string; entry: AttendanceEntry }> {
  const candidates = await prisma.staffProfile.findMany({
    where: {
      branchId,
      isActive: true,
      isDeleted: false,
      attendancePinHash: { not: null },
      name: { equals: name.trim(), mode: 'insensitive' },
    },
  });
  const staff = candidates.find((c) => c.attendancePinHash && verifyPin(pin, c.attendancePinHash));
  if (!staff) {
    throw new InvalidKioskCredentialsError();
  }

  const today = await getTodayEntryForStaff(staff.id);
  if (!today?.checkInAt) {
    const entry = await checkIn(staff.id, branchId, deviceStaffId, { source: 'KIOSK' });
    return { action: 'CHECK_IN', staffName: staff.name, entry };
  }
  if (!today.checkOutAt) {
    const entry = await checkOut(staff.id);
    return { action: 'CHECK_OUT', staffName: staff.name, entry };
  }
  throw new AlreadyDoneForTodayError();
}

function mapFieldAssignmentToDto(record: Prisma.FieldAssignmentGetPayload<object>): FieldAssignment {
  return {
    id: record.id,
    staffId: record.staffId,
    branchId: record.branchId,
    date: record.date.toISOString(),
    locationLabel: record.locationLabel,
    targetLatitude: record.targetLatitude,
    targetLongitude: record.targetLongitude,
    radiusMeters: record.radiusMeters,
    status: record.status,
    confirmedAt: record.confirmedAt ? record.confirmedAt.toISOString() : null,
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function createFieldAssignment(
  input: CreateFieldAssignmentInput,
  createdById: string,
): Promise<FieldAssignment> {
  const record = await prisma.fieldAssignment.create({
    data: {
      staffId: input.staffId,
      branchId: input.branchId,
      date: new Date(input.date),
      locationLabel: input.locationLabel,
      targetLatitude: input.targetLatitude,
      targetLongitude: input.targetLongitude,
      radiusMeters: input.radiusMeters ?? undefined,
      createdById,
    },
  });
  return mapFieldAssignmentToDto(record);
}

export async function listFieldAssignments(staffId?: string): Promise<FieldAssignment[]> {
  const records = await prisma.fieldAssignment.findMany({
    where: { isDeleted: false, ...(staffId ? { staffId } : {}) },
    orderBy: { date: 'desc' },
  });
  return records.map(mapFieldAssignmentToDto);
}

export async function myTodayFieldAssignments(staffId: string): Promise<FieldAssignment[]> {
  const date = todayUtcMidnight();
  const records = await prisma.fieldAssignment.findMany({
    where: { staffId, date, status: 'PENDING', isDeleted: false },
    orderBy: { createdAt: 'asc' },
  });
  return records.map(mapFieldAssignmentToDto);
}

export class FieldAssignmentNotFoundError extends Error {
  constructor() {
    super('التكليف غير موجود');
    this.name = 'FieldAssignmentNotFoundError';
  }
}

export class TooFarFromTargetError extends Error {
  constructor(public readonly distanceMeters: number) {
    super(`أنت على بعد ${Math.round(distanceMeters)} متر من المكان المطلوب`);
    this.name = 'TooFarFromTargetError';
  }
}

/** Haversine great-circle distance in meters — standard formula, no external dependency needed. */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * FEATURE-013 (owner: "لما يفتح اللوكيشن ويأكد انه في المكان ساعتها اسجله
 * حضوره") — on success, marks the assignment CONFIRMED and reuses
 * `checkIn` with `source: 'GPS'` (freezing the actual reported coordinates
 * on the AttendanceEntry, not the assignment's target ones).
 */
export async function confirmFieldAssignmentLocation(
  assignmentId: string,
  staffId: string,
  input: ConfirmFieldAssignmentInput,
): Promise<FieldAssignment> {
  const assignment = await prisma.fieldAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.isDeleted || assignment.staffId !== staffId) {
    throw new FieldAssignmentNotFoundError();
  }

  const distance = haversineMeters(
    input.latitude,
    input.longitude,
    assignment.targetLatitude,
    assignment.targetLongitude,
  );
  if (distance > assignment.radiusMeters) {
    throw new TooFarFromTargetError(distance);
  }

  const updated = await prisma.fieldAssignment.update({
    where: { id: assignmentId },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  });
  await checkIn(assignment.staffId, assignment.branchId, staffId, {
    source: 'GPS',
    latitude: input.latitude,
    longitude: input.longitude,
  });
  return mapFieldAssignmentToDto(updated);
}
