import { prisma } from '../lib/prisma.js';

/**
 * Owner (2026-08-17, "امسح سجلات الحضور القديمة تلقائيًا... أرشفة مش حذف
 * نهائي") — weekly-paid staff's attendance older than 30 days, monthly-
 * paid (or pay-frequency-unset) staff's older than 60 days, get archived
 * (soft-deleted). Never a real SQL DELETE — same `isDeleted`/`deletedAt`
 * columns every other soft-delete in this project already uses, so these
 * rows stay fully recoverable and don't disappear from anything that
 * already filters `isDeleted: false` (rule 19 — sensitive deletes stay
 * soft + audited).
 */
export async function archiveOldAttendanceEntries(): Promise<{ weeklyArchived: number; monthlyArchived: number }> {
  const now = new Date();
  const weeklyThreshold = new Date(now);
  weeklyThreshold.setDate(weeklyThreshold.getDate() - 30);
  const monthlyThreshold = new Date(now);
  monthlyThreshold.setDate(monthlyThreshold.getDate() - 60);

  const weekly = await prisma.attendanceEntry.updateMany({
    where: { isDeleted: false, date: { lt: weeklyThreshold }, staff: { payFrequency: 'WEEKLY' } },
    data: { isDeleted: true, deletedAt: now },
  });

  const monthly = await prisma.attendanceEntry.updateMany({
    where: {
      isDeleted: false,
      date: { lt: monthlyThreshold },
      staff: { OR: [{ payFrequency: 'MONTHLY' }, { payFrequency: null }] },
    },
    data: { isDeleted: true, deletedAt: now },
  });

  return { weeklyArchived: weekly.count, monthlyArchived: monthly.count };
}
