import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the campaign service (CRM review, 2026-09-25): the list scoping
 * (a branch-scoped list still includes company-wide campaigns), create defaults, partial
 * update, soft delete and the branch lookup the controller's access check relies on.
 * Only prisma is mocked.
 */

const campaignFindMany = vi.fn();
const campaignFindUnique = vi.fn();
const campaignCreate = vi.fn();
const campaignUpdate = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    campaign: {
      findMany: (...a: unknown[]) => campaignFindMany(...a),
      findUnique: (...a: unknown[]) => campaignFindUnique(...a),
      create: (...a: unknown[]) => campaignCreate(...a),
      update: (...a: unknown[]) => campaignUpdate(...a),
    },
  },
}));

const { listCampaigns, getCampaignBranchId, createCampaign, updateCampaign, deleteCampaign, CampaignNotFoundError } = await import('./campaignService.js');

const ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function dec(n: number) {
  return { toNumber: () => n };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    name: 'حملة عروض الصيف',
    channel: 'SOCIAL_MEDIA',
    status: 'DRAFT',
    startDate: null,
    endDate: null,
    budget: dec(1000),
    leadsGenerated: null,
    quotesGenerated: null,
    ordersGenerated: null,
    revenue: null,
    notes: null,
    branchId: BRANCH_A,
    recordedById: 'staff-1',
    recordedBy: { name: 'عمر' },
    isDeleted: false,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  campaignUpdate.mockImplementation(() => Promise.resolve(row()));
});

describe('listCampaigns', () => {
  it('a branch-scoped list returns those branches PLUS company-wide campaigns, never deleted ones', async () => {
    campaignFindMany.mockResolvedValue([]);
    await listCampaigns({ branchIds: [BRANCH_A] });
    expect(campaignFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDeleted: false, OR: [{ branchId: { in: [BRANCH_A] } }, { branchId: null }] } }),
    );
  });

  it('with no branch filter (SUPER_ADMIN) it lists everything not deleted', async () => {
    campaignFindMany.mockResolvedValue([]);
    await listCampaigns({});
    expect(campaignFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDeleted: false } }));
  });

  it('maps money to numbers and dates to ISO strings', async () => {
    campaignFindMany.mockResolvedValue([row({ revenue: dec(2500.5) })]);
    const [campaign] = await listCampaigns({});
    expect(campaign).toMatchObject({ budget: 1000, revenue: 2500.5, startDate: null, recordedByName: 'عمر' });
  });
});

describe('createCampaign', () => {
  it('defaults to DRAFT and a company-wide scope (no branch) when none is given', async () => {
    campaignCreate.mockResolvedValue(row({ branchId: null }));
    await createCampaign({ name: 'حملة', channel: 'EMAIL' } as never, 'staff-1');
    expect(campaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT', branchId: null, budget: null, recordedById: 'staff-1' }) }),
    );
  });
});

describe('getCampaignBranchId', () => {
  it('returns the branch, or null for a company-wide campaign', async () => {
    campaignFindUnique.mockResolvedValue({ branchId: BRANCH_A, isDeleted: false });
    await expect(getCampaignBranchId(ID)).resolves.toBe(BRANCH_A);
    campaignFindUnique.mockResolvedValue({ branchId: null, isDeleted: false });
    await expect(getCampaignBranchId(ID)).resolves.toBeNull();
  });

  it('throws CampaignNotFoundError for a missing or deleted campaign', async () => {
    campaignFindUnique.mockResolvedValue(null);
    await expect(getCampaignBranchId(ID)).rejects.toThrow(CampaignNotFoundError);
    campaignFindUnique.mockResolvedValue({ branchId: BRANCH_A, isDeleted: true });
    await expect(getCampaignBranchId(ID)).rejects.toThrow(CampaignNotFoundError);
  });
});

describe('updateCampaign / deleteCampaign', () => {
  it('a partial update only sends the fields that were provided', async () => {
    campaignFindUnique.mockResolvedValue(row());
    await updateCampaign(ID, { status: 'ACTIVE', leadsGenerated: 12 } as never);
    expect(campaignUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ACTIVE', leadsGenerated: 12 } }));
  });

  it('an update or delete of a missing/deleted campaign throws and writes nothing', async () => {
    campaignFindUnique.mockResolvedValue(row({ isDeleted: true }));
    await expect(updateCampaign(ID, { status: 'ACTIVE' } as never)).rejects.toThrow(CampaignNotFoundError);
    await expect(deleteCampaign(ID, 'staff-1')).rejects.toThrow(CampaignNotFoundError);
    expect(campaignUpdate).not.toHaveBeenCalled();
  });

  it('delete is a soft delete recording who deleted it', async () => {
    campaignFindUnique.mockResolvedValue(row());
    await deleteCampaign(ID, 'staff-1');
    expect(campaignUpdate).toHaveBeenCalledWith({
      where: { id: ID },
      data: { isDeleted: true, deletedAt: expect.any(Date), deletedBy: 'staff-1' },
    });
  });
});
