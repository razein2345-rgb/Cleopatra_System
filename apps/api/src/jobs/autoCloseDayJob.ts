import { prisma } from '../lib/prisma.js';
import { closeTreasuryDay, DayAlreadyClosedError, getDayClosurePreview } from '../services/treasuryService.js';

const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Owner (2026-08-23, "ان احدد وقت لما يجي الحساب بيتقفل دايركت والموظف
 * لو لسه موجود يكلمني افتحوله") — a single global "HH:MM" (24h) closing
 * time (`Setting.autoCloseDayTime`, null = feature off). Every branch's
 * treasury day force-closes the moment that time passes, same real
 * cash-drawer reconciliation `closeTreasuryDay` always does — except
 * nobody physically counted the drawer, so `actualCountedCash` is set
 * equal to `expectedClosingBalance` (difference always 0 on an auto-
 * close). Reopening afterward stays exactly as restrictive as it already
 * was (SUPER_ADMIN/ADMIN only, enforced in the controller) — this job
 * never loosens that, matching "الموظف... يكلمني افتحوله".
 *
 * Attributed to a real SUPER_ADMIN account (`closedById` is a required
 * FK) rather than inventing a "system" staff row — the owner is the one
 * who set the policy, so the closure is recorded under their identity.
 */
export function startAutoCloseDayJob(): void {
  const run = () => {
    runOnce().catch((err: unknown) => {
      console.error('[auto-close-day] sweep failed:', err);
    });
  };
  run();
  setInterval(run, CHECK_INTERVAL_MS);
}

async function runOnce(): Promise<void> {
  const setting = await prisma.setting.findFirst({ select: { autoCloseDayTime: true } });
  const closeTime = setting?.autoCloseDayTime;
  if (!closeTime) return;

  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (nowHHMM < closeTime) return;

  const superAdmin = await prisma.userRole.findFirst({
    where: { role: { name: 'SUPER_ADMIN' }, staff: { isActive: true } },
    select: { staffId: true },
  });
  if (!superAdmin) return;

  const branches = await prisma.branch.findMany({ where: { isDeleted: false }, select: { id: true } });
  for (const branch of branches) {
    try {
      const preview = await getDayClosurePreview(branch.id);
      const closed = await closeTreasuryDay(
        branch.id,
        superAdmin.staffId,
        preview.expectedClosingBalance,
        'تقفيل تلقائي — الوقت المحدد في الإعدادات وصل',
        true,
      );
      console.log(`[auto-close-day] closed branch ${branch.id} for ${closed.date}`);
    } catch (err) {
      // Already closed (manually or by an earlier tick today) — the
      // expected, silent no-op case, not a real failure.
      if (err instanceof DayAlreadyClosedError) continue;
      console.error(`[auto-close-day] failed to close branch ${branch.id}:`, err);
    }
  }
}
