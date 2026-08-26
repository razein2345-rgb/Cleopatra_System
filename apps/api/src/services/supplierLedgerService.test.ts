import { describe, expect, it } from 'vitest';
import { buildStatement, type RawLedgerEntry } from './supplierLedgerService.js';

// Owner (2026-08-26, "كل مورد معروف... وهو ليه كام عندي بالظبط... أقدر
// احدد الفترة") — purchase (supplier charges us) is +, payment (we pay
// them) is -. Balance carried in from before `from` must fold into
// openingBalance, not reset to zero at the period boundary.

const d = (s: string) => new Date(s);

describe('buildStatement', () => {
  it('computes a running balance with no date filter', () => {
    const entries: RawLedgerEntry[] = [
      { kind: 'PURCHASE', id: 'p1', date: d('2026-08-01'), description: 'ورق', amount: 500 },
      { kind: 'PAYMENT', id: 'pay1', date: d('2026-08-05'), description: null, amount: 200 },
      { kind: 'PURCHASE', id: 'p2', date: d('2026-08-10'), description: 'حبر', amount: 100 },
    ];
    const result = buildStatement(entries);
    expect(result.openingBalance).toBe(0);
    expect(result.entries.map((e) => e.runningBalance)).toEqual([500, 300, 400]);
    expect(result.closingBalance).toBe(400);
  });

  it('folds pre-period entries into openingBalance and keeps the running balance continuous', () => {
    const entries: RawLedgerEntry[] = [
      { kind: 'PURCHASE', id: 'p1', date: d('2026-07-01'), description: null, amount: 1000 },
      { kind: 'PAYMENT', id: 'pay1', date: d('2026-07-15'), description: null, amount: 300 },
      { kind: 'PURCHASE', id: 'p2', date: d('2026-08-05'), description: null, amount: 50 },
    ];
    const result = buildStatement(entries, d('2026-08-01'));
    expect(result.openingBalance).toBe(700); // 1000 - 300
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].runningBalance).toBe(750); // 700 + 50
    expect(result.closingBalance).toBe(750);
  });

  it('excludes entries after `to` entirely, from both the list and the closing balance', () => {
    const entries: RawLedgerEntry[] = [
      { kind: 'PURCHASE', id: 'p1', date: d('2026-08-01'), description: null, amount: 500 },
      { kind: 'PURCHASE', id: 'p2', date: d('2026-08-20'), description: null, amount: 999 },
    ];
    const result = buildStatement(entries, undefined, d('2026-08-10'));
    expect(result.entries).toHaveLength(1);
    expect(result.closingBalance).toBe(500);
  });
});
