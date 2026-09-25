import { describe, expect, it } from 'vitest';
import type { CallLog } from '@cleopatra/shared';
import { buildCallHistory } from './callHistory';

function call(id: string, createdAt: string): CallLog {
  return {
    id,
    direction: 'INBOUND',
    purpose: 'استفسار',
    outcome: 'RESOLVED',
    notes: null,
    partnerId: null,
    partnerName: null,
    leadId: null,
    leadName: null,
    contactName: null,
    contactPhone: null,
    branchId: 'b1',
    staffId: 's1',
    staffName: 'عمر',
    followUpDate: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('buildCallHistory', () => {
  it('merges customer and pre-conversion lead calls, newest first, and marks the lead ones', () => {
    const rows = buildCallHistory(
      [call('c-new', '2026-09-20T10:00:00.000Z'), call('c-old', '2026-09-05T10:00:00.000Z')],
      [call('l-mid', '2026-09-10T10:00:00.000Z')],
    );
    expect(rows.map((r) => [r.log.id, r.beforeConversion])).toEqual([
      ['c-new', false],
      ['l-mid', true],
      ['c-old', false],
    ]);
  });

  it('a call that appears in both lists is shown once, as a customer call', () => {
    const shared = call('dup', '2026-09-10T10:00:00.000Z');
    const rows = buildCallHistory([shared], [shared]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.beforeConversion).toBe(false);
  });

  it('a customer who did not come from a lead simply has their own calls', () => {
    const rows = buildCallHistory([call('a', '2026-09-01T00:00:00.000Z')], []);
    expect(rows.map((r) => r.log.id)).toEqual(['a']);
  });

  it('no calls at all is an empty history', () => {
    expect(buildCallHistory([], [])).toEqual([]);
  });
});
