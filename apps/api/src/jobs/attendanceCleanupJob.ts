import { archiveOldAttendanceEntries } from '../services/attendanceCleanupService.js';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Owner (2026-08-17, "امسح سجلات الحضور القديمة تلقائيًا... أرشفة مش حذف
 * نهائي") — daily retention sweep, no cron-expression library added: this
 * one Express process (Render) stays running continuously, so a self-
 * rescheduling daily interval is all a "once a day" job needs.
 */
export function startAttendanceCleanupJob(): void {
  const run = () => {
    archiveOldAttendanceEntries()
      .then(({ weeklyArchived, monthlyArchived }) => {
        if (weeklyArchived > 0 || monthlyArchived > 0) {
          console.log(
            `[attendance-cleanup] archived ${weeklyArchived} weekly-staff + ${monthlyArchived} monthly-staff attendance entries`,
          );
        }
      })
      .catch((err: unknown) => {
        console.error('[attendance-cleanup] sweep failed:', err);
      });
  };
  run();
  setInterval(run, TWENTY_FOUR_HOURS_MS);
}
