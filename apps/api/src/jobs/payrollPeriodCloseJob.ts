import { closeDuePayrollPeriods } from '../services/payrollPeriodService.js';

const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Owner (2026-09-02, "بالنسبة للمرتبات عايز لما الشهر يخلص يتحسب المرتب
 * بالظبط ويتحفظ لحد ما يتصرف للموظف والشهر الجديد يكون منفصل عن القديم
 * علشان منخلطش بين الشهور") — confirmed automatic: no "قفل الشهر" button
 * for anyone to remember to click. Same idempotent-sweep shape as
 * `autoCloseDayJob.ts` — every tick, `closeDuePayrollPeriods` freezes
 * whichever MONTHLY employees' previous pay cycle has just fully ended
 * (or was reopened and is due to be recomputed), and is a no-op for
 * everyone else.
 */
export function startPayrollPeriodCloseJob(): void {
  const run = () => {
    closeDuePayrollPeriods()
      .then((closedCount) => {
        if (closedCount > 0) console.log(`[payroll-period-close] froze ${closedCount} period(s)`);
      })
      .catch((err: unknown) => {
        console.error('[payroll-period-close] sweep failed:', err);
      });
  };
  run();
  setInterval(run, CHECK_INTERVAL_MS);
}
