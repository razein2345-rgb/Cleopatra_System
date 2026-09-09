import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Branch isolation (تكملة 62/69's fixed pattern, CLEOPATRA_AI_SECURITY.md
 * §2): a non-SUPER_ADMIN caller must never see another branch's treasury
 * — this tool must pass their own `accessibleBranchIds`, never `'all'`/
 * `undefined`, unless they are actually SUPER_ADMIN.
 */
const getTreasuryBalance = vi.fn<typeof import('../../treasuryService.js').getTreasuryBalance>(
  async () => ({ totalIncome: 0, totalExpense: 0, totalTransfer: 0, balance: 0, byMethod: [] }) as never,
);

vi.mock('../../treasuryService.js', () => ({ getTreasuryBalance }));

const { getTreasurySummaryTool } = await import('./getTreasurySummary.js');

beforeEach(() => {
  getTreasuryBalance.mockClear();
});

describe('get_treasury_summary tool — branch isolation', () => {
  it('scopes a non-SUPER_ADMIN caller to only their own accessible branches', async () => {
    await getTreasurySummaryTool.execute(
      {},
      { auth: { roleNames: ['CASHIER'], accessibleBranchIds: ['branch-cleopatra'] } as never },
    );
    expect(getTreasuryBalance).toHaveBeenCalledWith(['branch-cleopatra']);
  });

  it('never restricts a SUPER_ADMIN caller — passes undefined (every branch)', async () => {
    await getTreasurySummaryTool.execute(
      {},
      { auth: { roleNames: ['SUPER_ADMIN'], accessibleBranchIds: ['branch-cleopatra'] } as never },
    );
    expect(getTreasuryBalance).toHaveBeenCalledWith(undefined);
  });
});
