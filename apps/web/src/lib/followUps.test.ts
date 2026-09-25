import { describe, expect, it } from 'vitest';
import type { CallLog, Lead } from '@cleopatra/shared';
import { buildFollowUpRows, localDateKey } from './followUps';

const TODAY = '2026-09-25';

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    name: 'شركة النور',
    phone: '01011112222',
    email: null,
    facebookUrl: null,
    source: null,
    stage: 'NEW',
    notes: null,
    branchId: 'b1',
    assignedToId: null,
    recordedById: 's1',
    nextFollowUpAt: null,
    convertedPartnerId: null,
    rejectedReason: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function call(overrides: Partial<CallLog> = {}): CallLog {
  return {
    id: 'c1',
    direction: 'INBOUND',
    purpose: 'استفسار عن سعر',
    outcome: 'NEEDS_FOLLOWUP',
    notes: null,
    partnerId: null,
    partnerName: null,
    leadId: null,
    leadName: null,
    contactName: 'متصل',
    contactPhone: null,
    branchId: 'b1',
    staffId: 's1',
    staffName: 'عمر',
    followUpDate: null,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildFollowUpRows - leads', () => {
  it('lists an open lead whose follow-up date has passed, with how many days late', () => {
    const rows = buildFollowUpRows([lead({ nextFollowUpAt: '2026-09-22T00:00:00.000Z' })], [], TODAY);
    expect(rows).toEqual([expect.objectContaining({ kind: 'lead', name: 'شركة النور', dueDate: '2026-09-22', daysOverdue: 3, to: '/leads' })]);
  });

  it('a follow-up due TODAY is listed (0 days overdue); a future one is not', () => {
    const rows = buildFollowUpRows(
      [lead({ id: 'a', nextFollowUpAt: '2026-09-25T00:00:00.000Z' }), lead({ id: 'b', nextFollowUpAt: '2026-09-26T00:00:00.000Z' })],
      [],
      TODAY,
    );
    expect(rows.map((r) => [r.id, r.daysOverdue])).toEqual([['a', 0]]);
  });

  it('a lead with no follow-up date, or one that is converted or rejected, never appears', () => {
    const past = '2026-09-01T00:00:00.000Z';
    const rows = buildFollowUpRows(
      [lead({ id: 'none' }), lead({ id: 'conv', stage: 'CONVERTED', nextFollowUpAt: past }), lead({ id: 'rej', stage: 'REJECTED', nextFollowUpAt: past })],
      [],
      TODAY,
    );
    expect(rows).toEqual([]);
  });

  it('every open stage counts', () => {
    const past = '2026-09-01T00:00:00.000Z';
    const rows = buildFollowUpRows(
      (['NEW', 'CONTACTED', 'QUALIFIED'] as const).map((stage) => lead({ id: stage, stage, nextFollowUpAt: past })),
      [],
      TODAY,
    );
    expect(rows.map((r) => r.id).sort()).toEqual(['CONTACTED', 'NEW', 'QUALIFIED']);
  });
});

describe('buildFollowUpRows - calls', () => {
  it('lists an unresolved call whose follow-up date has come, naming the customer, else the lead, else the caller', () => {
    const rows = buildFollowUpRows(
      [],
      [
        call({ id: 'p', partnerName: 'عميل أ', followUpDate: '2026-09-24T00:00:00.000Z' }),
        call({ id: 'l', leadName: 'ليد ب', followUpDate: '2026-09-24T00:00:00.000Z' }),
        call({ id: 'n', followUpDate: '2026-09-24T00:00:00.000Z' }),
      ],
      TODAY,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.p).toMatchObject({ name: 'عميل أ', detail: 'استفسار عن سعر', to: '/call-center' });
    expect(byId.l).toMatchObject({ name: 'ليد ب' });
    expect(byId.n).toMatchObject({ name: 'متصل' });
  });

  it('a resolved call, one with no follow-up date, or a future one never appears', () => {
    const rows = buildFollowUpRows(
      [],
      [
        call({ id: 'done', outcome: 'RESOLVED', followUpDate: '2026-09-01T00:00:00.000Z' }),
        call({ id: 'nodate' }),
        call({ id: 'future', followUpDate: '2026-10-01T00:00:00.000Z' }),
      ],
      TODAY,
    );
    expect(rows).toEqual([]);
  });
});

describe('buildFollowUpRows - ordering and dates', () => {
  it('most overdue first; on the same day leads come before calls', () => {
    const rows = buildFollowUpRows(
      [lead({ id: 'lead-new', nextFollowUpAt: '2026-09-24T00:00:00.000Z' })],
      [call({ id: 'call-old', followUpDate: '2026-09-20T00:00:00.000Z' }), call({ id: 'call-same', followUpDate: '2026-09-24T00:00:00.000Z' })],
      TODAY,
    );
    expect(rows.map((r) => r.id)).toEqual(['call-old', 'lead-new', 'call-same']);
  });

  it('compares the calendar date only - a late-evening UTC timestamp does not slip into the next day', () => {
    const rows = buildFollowUpRows([lead({ nextFollowUpAt: '2026-09-25T23:59:59.000Z' })], [], TODAY);
    expect(rows[0]).toMatchObject({ dueDate: '2026-09-25', daysOverdue: 0 });
  });

  it('day counts survive a month boundary', () => {
    const rows = buildFollowUpRows([lead({ nextFollowUpAt: '2026-08-30T00:00:00.000Z' })], [], '2026-09-02');
    expect(rows[0]!.daysOverdue).toBe(3);
  });
});

describe('localDateKey', () => {
  it('formats the local calendar day as yyyy-mm-dd with zero padding', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 8, 25, 0, 5))).toBe('2026-09-25');
  });
});
