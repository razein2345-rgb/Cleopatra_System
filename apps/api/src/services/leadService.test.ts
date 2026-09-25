import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the lead pipeline's service layer (CRM review,
 * 2026-09-25): list scoping, the stage rules, the lead -> customer conversion
 * (the one place a Lead becomes real data), soft delete, and the branch lookup
 * the controller's access check relies on. Only prisma is mocked.
 */

const leadFindMany = vi.fn();
const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
const leadCreate = vi.fn();
const partnerCreate = vi.fn();
const partnerFindMany = vi.fn();

const tx = {
  businessPartner: { create: (...a: unknown[]) => partnerCreate(...a) },
  lead: { update: (...a: unknown[]) => leadUpdate(...a) },
};

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    lead: {
      findMany: (...a: unknown[]) => leadFindMany(...a),
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
      create: (...a: unknown[]) => leadCreate(...a),
    },
    businessPartner: { findMany: (...a: unknown[]) => partnerFindMany(...a) },
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}));
vi.mock('./businessPartnerService.js', () => ({ mapPartnerToDto: (p: unknown) => p }));

const {
  listLeads,
  getLeadBranchId,
  advanceLeadStage,
  rejectLead,
  updateLead,
  convertLeadToPartner,
  deleteLead,
  bulkCreateLeads,
  assertNoDuplicatePhone,
  loadPhoneIndex,
  DuplicatePhoneError,
  LeadNotFoundError,
  LeadAlreadyResolvedError,
} = await import('./leadService.js');

const LEAD_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    name: 'شركة النور',
    phone: '01011112222',
    email: 'info@nour.test',
    facebookUrl: null,
    source: 'REFERRAL',
    stage: 'QUALIFIED',
    notes: 'مهتم بكتالوج',
    branchId: BRANCH_A,
    assignedToId: 'staff-9',
    recordedById: 'staff-1',
    nextFollowUpAt: null,
    convertedPartnerId: null,
    rejectedReason: null,
    isDeleted: false,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  partnerFindMany.mockResolvedValue([]);
  leadFindMany.mockResolvedValue([]);
  leadUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(leadRow(data)));
});

describe('listLeads', () => {
  it('always excludes deleted leads and, when given branch ids, only returns those branches', async () => {
    leadFindMany.mockResolvedValue([]);
    await listLeads({ branchIds: [BRANCH_A] });
    expect(leadFindMany).toHaveBeenCalledWith({ where: { isDeleted: false, branchId: { in: [BRANCH_A] } }, orderBy: { createdAt: 'desc' } });
  });

  it('with no filter it returns every branch (the SUPER_ADMIN case)', async () => {
    leadFindMany.mockResolvedValue([]);
    await listLeads();
    expect(leadFindMany).toHaveBeenCalledWith({ where: { isDeleted: false }, orderBy: { createdAt: 'desc' } });
  });
});

describe('getLeadBranchId', () => {
  it('returns the lead\'s branch', async () => {
    leadFindUnique.mockResolvedValue({ branchId: BRANCH_B, isDeleted: false });
    await expect(getLeadBranchId(LEAD_ID)).resolves.toBe(BRANCH_B);
  });

  it('throws LeadNotFoundError for a missing or deleted lead', async () => {
    leadFindUnique.mockResolvedValue(null);
    await expect(getLeadBranchId(LEAD_ID)).rejects.toThrow(LeadNotFoundError);
    leadFindUnique.mockResolvedValue({ branchId: BRANCH_B, isDeleted: true });
    await expect(getLeadBranchId(LEAD_ID)).rejects.toThrow(LeadNotFoundError);
  });
});

describe('a resolved lead (converted or rejected) can no longer be changed', () => {
  for (const stage of ['CONVERTED', 'REJECTED']) {
    it(`${stage}: update, stage change, reject and convert all throw LeadAlreadyResolvedError and write nothing`, async () => {
      leadFindUnique.mockResolvedValue(leadRow({ stage }));
      await expect(updateLead(LEAD_ID, { name: 'x' })).rejects.toThrow(LeadAlreadyResolvedError);
      await expect(advanceLeadStage(LEAD_ID, 'CONTACTED')).rejects.toThrow(LeadAlreadyResolvedError);
      await expect(rejectLead(LEAD_ID, 'سبب')).rejects.toThrow(LeadAlreadyResolvedError);
      await expect(convertLeadToPartner(LEAD_ID)).rejects.toThrow(LeadAlreadyResolvedError);
      expect(leadUpdate).not.toHaveBeenCalled();
      expect(partnerCreate).not.toHaveBeenCalled();
    });
  }
});

describe('stage changes', () => {
  it('advances an open lead to the requested stage', async () => {
    leadFindUnique.mockResolvedValue(leadRow({ stage: 'NEW' }));
    const lead = await advanceLeadStage(LEAD_ID, 'CONTACTED');
    expect(leadUpdate).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { stage: 'CONTACTED' } });
    expect(lead.stage).toBe('CONTACTED');
  });

  it('rejecting stores the reason (or null when none is given)', async () => {
    leadFindUnique.mockResolvedValue(leadRow());
    await rejectLead(LEAD_ID, 'السعر عالي');
    expect(leadUpdate).toHaveBeenLastCalledWith({ where: { id: LEAD_ID }, data: { stage: 'REJECTED', rejectedReason: 'السعر عالي' } });
    await rejectLead(LEAD_ID, undefined);
    expect(leadUpdate).toHaveBeenLastCalledWith({ where: { id: LEAD_ID }, data: { stage: 'REJECTED', rejectedReason: null } });
  });
});

describe('convertLeadToPartner', () => {
  it('creates a PROSPECT customer from the lead\'s data in the lead\'s branch, and marks the lead CONVERTED with that customer\'s id', async () => {
    leadFindUnique.mockResolvedValue(leadRow());
    partnerCreate.mockResolvedValue({ id: 'partner-1', branchId: BRANCH_A });

    const result = await convertLeadToPartner(LEAD_ID);

    expect(partnerCreate).toHaveBeenCalledWith({
      data: {
        nameAr: 'شركة النور',
        phone: '01011112222',
        email: 'info@nour.test',
        branchId: BRANCH_A,
        salesRepId: 'staff-9',
        leadSource: 'REFERRAL',
        status: 'PROSPECT',
        notes: 'مهتم بكتالوج',
      },
    });
    expect(leadUpdate).toHaveBeenCalledWith({ where: { id: LEAD_ID }, data: { stage: 'CONVERTED', convertedPartnerId: 'partner-1' } });
    expect(result).toMatchObject({ leadId: LEAD_ID, partnerId: 'partner-1' });
  });

  it('a missing or deleted lead throws LeadNotFoundError and creates no customer', async () => {
    leadFindUnique.mockResolvedValue(null);
    await expect(convertLeadToPartner(LEAD_ID)).rejects.toThrow(LeadNotFoundError);
    expect(partnerCreate).not.toHaveBeenCalled();
  });
});

describe('deleteLead', () => {
  it('soft-deletes (isDeleted + deletedBy), never removes the row', async () => {
    leadFindUnique.mockResolvedValue(leadRow());
    await deleteLead(LEAD_ID, 'staff-1');
    expect(leadUpdate).toHaveBeenCalledWith({
      where: { id: LEAD_ID },
      data: { isDeleted: true, deletedAt: expect.any(Date), deletedBy: 'staff-1' },
    });
  });

  it('an unknown or already-deleted lead is LeadNotFoundError', async () => {
    leadFindUnique.mockResolvedValue(leadRow({ isDeleted: true }));
    await expect(deleteLead(LEAD_ID, 'staff-1')).rejects.toThrow(LeadNotFoundError);
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});

describe('bulkCreateLeads (Excel/CSV import)', () => {
  it('creates row by row - one bad row is reported and does not stop the others', async () => {
    leadCreate.mockImplementation(({ data }: { data: { name: string; phone: string } }) => Promise.resolve(leadRow({ name: data.name, phone: data.phone })));

    const results = await bulkCreateLeads(
      [
        { rowNumber: 2, name: 'عميل أول', phone: '01011112222' },
        { rowNumber: 3, name: '', phone: '01033334444' },
        { rowNumber: 4, name: 'عميل ثالث', phone: '01055556666' },
      ],
      BRANCH_A,
      'WEBSITE',
      'staff-1',
    );

    expect(results.map((r) => r.success)).toEqual([true, false, true]);
    expect(results[1]!.error).toBeTruthy();
    expect(leadCreate).toHaveBeenCalledTimes(2);
    // one branch + one source apply to the whole batch
    expect(leadCreate.mock.calls.every((c) => (c[0] as { data: { branchId: string; source: string } }).data.branchId === BRANCH_A)).toBe(true);
  });
});

describe('duplicate phone detection (owner decision, 2026-09-25)', () => {
  const partnerRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'p1',
    nameAr: 'شركة النور',
    phone: '+20 101 111 2222',
    branchId: BRANCH_B,
    status: 'ACTIVE',
    ...overrides,
  });

  it('finds an existing customer written differently ("+20 101 111 2222" vs "010 1111 2222")', async () => {
    partnerFindMany.mockResolvedValue([partnerRow()]);
    const { lookup } = await loadPhoneIndex({ includeLeads: false });
    expect(lookup('010 1111 2222')).toEqual([{ kind: 'partner', id: 'p1', name: 'شركة النور', branchId: BRANCH_B, detail: 'ACTIVE' }]);
    expect(lookup('01033334444')).toEqual([]);
  });

  it('only live customers are considered (deleted ones and ones without a phone are filtered in the query)', async () => {
    await loadPhoneIndex({ includeLeads: true });
    expect(partnerFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDeleted: false, phone: { not: null } } }));
    expect(leadFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDeleted: false, stage: { not: 'CONVERTED' } } }));
  });

  it('leads are only loaded when asked, and the lead being edited can be excluded', async () => {
    await loadPhoneIndex({ includeLeads: false });
    expect(leadFindMany).not.toHaveBeenCalled();
    await loadPhoneIndex({ includeLeads: true, excludeLeadId: LEAD_ID });
    expect(leadFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDeleted: false, stage: { not: 'CONVERTED' }, id: { not: LEAD_ID } } }));
  });

  it('assertNoDuplicatePhone throws DuplicatePhoneError carrying every match, and passes when the number is new', async () => {
    partnerFindMany.mockResolvedValue([partnerRow()]);
    leadFindMany.mockResolvedValue([{ id: 'l9', name: 'ليد قديم', phone: '01011112222', branchId: BRANCH_A, stage: 'NEW' }]);
    await expect(assertNoDuplicatePhone('01011112222', { includeLeads: true })).rejects.toMatchObject({
      name: 'DuplicatePhoneError',
      matches: [expect.objectContaining({ kind: 'partner' }), expect.objectContaining({ kind: 'lead', id: 'l9' })],
    });
    await expect(assertNoDuplicatePhone('01099998888', { includeLeads: true })).resolves.toBeUndefined();
  });

  it('a too-short phone value is never a duplicate', async () => {
    partnerFindMany.mockResolvedValue([partnerRow({ phone: '123' })]);
    await expect(assertNoDuplicatePhone('123', { includeLeads: false })).resolves.toBeUndefined();
  });

  it('converting a lead whose phone already belongs to a customer is refused - no customer is created, the lead stays open', async () => {
    leadFindUnique.mockResolvedValue(leadRow({ phone: '01011112222' }));
    partnerFindMany.mockResolvedValue([partnerRow()]);
    await expect(convertLeadToPartner(LEAD_ID)).rejects.toThrow(DuplicatePhoneError);
    expect(partnerCreate).not.toHaveBeenCalled();
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('converting checks customers only (another open lead with the same phone does not block it)', async () => {
    leadFindUnique.mockResolvedValue(leadRow({ phone: '01011112222' }));
    partnerCreate.mockResolvedValue({ id: 'partner-1', branchId: BRANCH_A });
    await convertLeadToPartner(LEAD_ID);
    expect(leadFindMany).not.toHaveBeenCalled();
  });

  it('allowDuplicate creates the customer anyway', async () => {
    leadFindUnique.mockResolvedValue(leadRow({ phone: '01011112222' }));
    partnerFindMany.mockResolvedValue([partnerRow()]);
    partnerCreate.mockResolvedValue({ id: 'partner-2', branchId: BRANCH_A });
    await expect(convertLeadToPartner(LEAD_ID, { allowDuplicate: true })).resolves.toMatchObject({ partnerId: 'partner-2' });
    expect(partnerFindMany).not.toHaveBeenCalled();
  });
});

describe('bulkCreateLeads - duplicates', () => {
  const rows = [
    { rowNumber: 2, name: 'جديد', phone: '01011112222' },
    { rowNumber: 3, name: 'نفس رقم عميل موجود', phone: '010 3333 4444' },
    { rowNumber: 4, name: 'تكرار للصف الأول', phone: '+20 101 111 2222' },
    { rowNumber: 5, name: 'آخر جديد', phone: '01055556666' },
  ];

  beforeEach(() => {
    leadCreate.mockImplementation(({ data }: { data: { name: string; phone: string } }) =>
      Promise.resolve(leadRow({ id: `new-${data.phone}`, name: data.name, phone: data.phone })),
    );
    partnerFindMany.mockResolvedValue([{ id: 'p1', nameAr: 'شركة موجودة', phone: '01033334444', branchId: BRANCH_A, status: 'ACTIVE' }]);
  });

  it('skips a row that matches an existing customer AND a row that repeats an earlier row of the same file, and reports why', async () => {
    const results = await bulkCreateLeads(rows, BRANCH_A, undefined, 'staff-1');
    expect(results.map((r) => r.success)).toEqual([true, false, false, true]);
    expect(results[1]!.error).toContain('شركة موجودة');
    expect(results[2]!.error).toContain('جديد');
    expect(leadCreate).toHaveBeenCalledTimes(2);
  });

  it('allowDuplicates imports every valid row and never even loads the index', async () => {
    const results = await bulkCreateLeads(rows, BRANCH_A, undefined, 'staff-1', { allowDuplicates: true });
    expect(results.every((r) => r.success)).toBe(true);
    expect(leadCreate).toHaveBeenCalledTimes(4);
    expect(partnerFindMany).not.toHaveBeenCalled();
  });
});
