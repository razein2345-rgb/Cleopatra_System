import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the Campaigns controller (CRM review, 2026-09-25). Locks the
 * branch rule found in that review: edit/delete are checked against the CAMPAIGN's own
 * branch (and the destination when an edit moves it), never the caller's home branch;
 * a company-wide campaign (no branch) stays editable by anyone holding the permission;
 * a rejected action writes and audits nothing. Real `canAccessBranch`; services and audit mocked.
 */

const listCampaigns = vi.fn();
const getCampaignBranchId = vi.fn();
const createCampaign = vi.fn();
const updateCampaign = vi.fn();
const deleteCampaign = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/campaignService.js', () => ({
  listCampaigns,
  getCampaignBranchId,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  CampaignNotFoundError: class CampaignNotFoundError extends Error {},
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const handlers = await import('./campaigns.js');

const CAMPAIGN_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

interface FakeAuth {
  staffId: string;
  branchId: string;
  roleNames: string[];
  accessibleBranchIds: string[];
}

const salesA: FakeAuth = { staffId: 'staff-a', branchId: BRANCH_A, roleNames: ['SALES'], accessibleBranchIds: [BRANCH_A] };
const superAdmin: FakeAuth = { staffId: 'root', branchId: BRANCH_A, roleNames: ['SUPER_ADMIN'], accessibleBranchIds: [BRANCH_A] };

function makeRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

const idReq = (auth: FakeAuth, body: unknown = {}) => ({ params: { id: CAMPAIGN_ID }, body, auth }) as never;

function expectNothingWritten() {
  expect(updateCampaign).not.toHaveBeenCalled();
  expect(deleteCampaign).not.toHaveBeenCalled();
  expect(recordAudit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('list / create', () => {
  it('a branch-scoped caller lists only their branches; a SUPER_ADMIN is unfiltered', async () => {
    listCampaigns.mockResolvedValue([]);
    await handlers.listCampaignsHandler({ auth: salesA } as never, makeRes() as never);
    expect(listCampaigns).toHaveBeenLastCalledWith({ branchIds: [BRANCH_A] });
    await handlers.listCampaignsHandler({ auth: superAdmin } as never, makeRes() as never);
    expect(listCampaigns).toHaveBeenLastCalledWith({ branchIds: undefined });
  });

  it('creating under a branch the caller cannot access is 403 and writes nothing', async () => {
    const res = makeRes();
    await handlers.createCampaignHandler({ body: { name: 'حملة', channel: 'SOCIAL_MEDIA', branchId: BRANCH_B }, auth: salesA } as never, res as never);
    expect(res.statusCode).toBe(403);
    expect(createCampaign).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('a company-wide campaign (no branch) or one in an accessible branch is created and audited', async () => {
    createCampaign.mockResolvedValue({ id: CAMPAIGN_ID, name: 'حملة', channel: 'SOCIAL_MEDIA', budget: 100, branchId: null });
    const res = makeRes();
    await handlers.createCampaignHandler({ body: { name: 'حملة', channel: 'SOCIAL_MEDIA' }, auth: salesA } as never, res as never);
    expect(res.statusCode).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }));
  });
});

describe('update - the campaign\'s own branch decides', () => {
  it('editing a campaign of a branch the caller cannot access is 403 and nothing is written', async () => {
    getCampaignBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();
    await handlers.updateCampaignHandler(idReq(salesA, { status: 'ACTIVE' }), res as never);
    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('moving the caller\'s own campaign to a branch they cannot access is 403 and nothing is written', async () => {
    getCampaignBranchId.mockResolvedValue(BRANCH_A);
    const res = makeRes();
    await handlers.updateCampaignHandler(idReq(salesA, { branchId: BRANCH_B }), res as never);
    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('an unknown / deleted campaign is 404', async () => {
    const { CampaignNotFoundError } = await import('../services/campaignService.js');
    getCampaignBranchId.mockRejectedValue(new (CampaignNotFoundError as new () => Error)());
    const res = makeRes();
    await handlers.updateCampaignHandler(idReq(salesA, { status: 'ACTIVE' }), res as never);
    expect(res.statusCode).toBe(404);
    expectNothingWritten();
  });

  it('editing an accessible campaign works and is audited under its ORIGINAL branch, the move visible in the payload', async () => {
    const granted: FakeAuth = { ...salesA, accessibleBranchIds: [BRANCH_A, BRANCH_B] };
    getCampaignBranchId.mockResolvedValue(BRANCH_A);
    updateCampaign.mockResolvedValue({ id: CAMPAIGN_ID, branchId: BRANCH_B });
    const res = makeRes();
    await handlers.updateCampaignHandler(idReq(granted, { branchId: BRANCH_B }), res as never);
    expect(updateCampaign).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', branchId: BRANCH_A, newValue: { branchId: BRANCH_B } }));
  });

  it('a company-wide campaign (no branch) stays editable by a branch-scoped holder of the permission (unchanged behaviour)', async () => {
    getCampaignBranchId.mockResolvedValue(null);
    updateCampaign.mockResolvedValue({ id: CAMPAIGN_ID, branchId: null });
    const res = makeRes();
    await handlers.updateCampaignHandler(idReq(salesA, { revenue: 500 }), res as never);
    expect(updateCampaign).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ success: true });
  });

  it('a SUPER_ADMIN may edit a campaign of any branch', async () => {
    getCampaignBranchId.mockResolvedValue(BRANCH_B);
    updateCampaign.mockResolvedValue({ id: CAMPAIGN_ID, branchId: BRANCH_B });
    await handlers.updateCampaignHandler(idReq(superAdmin, { status: 'PAUSED' }), makeRes() as never);
    expect(updateCampaign).toHaveBeenCalledTimes(1);
  });
});

describe('delete - the campaign\'s own branch decides', () => {
  it('deleting a campaign of a branch the caller cannot access is 403 and nothing is deleted or audited', async () => {
    getCampaignBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();
    await handlers.deleteCampaignHandler(idReq(salesA), res as never);
    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('an unknown / deleted campaign is 404', async () => {
    const { CampaignNotFoundError } = await import('../services/campaignService.js');
    getCampaignBranchId.mockRejectedValue(new (CampaignNotFoundError as new () => Error)());
    const res = makeRes();
    await handlers.deleteCampaignHandler(idReq(salesA), res as never);
    expect(res.statusCode).toBe(404);
    expectNothingWritten();
  });

  it('deleting an accessible campaign soft-deletes it and audits under the campaign\'s branch (the row used to have none)', async () => {
    getCampaignBranchId.mockResolvedValue(BRANCH_A);
    deleteCampaign.mockResolvedValue(undefined);
    await handlers.deleteCampaignHandler(idReq(salesA), makeRes() as never);
    expect(deleteCampaign).toHaveBeenCalledWith(CAMPAIGN_ID, salesA.staffId);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', branchId: BRANCH_A }));
  });
});
