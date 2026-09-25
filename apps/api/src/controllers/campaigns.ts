import type { Request, Response } from 'express';
import { createCampaignSchema, updateCampaignSchema } from '@cleopatra/shared';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';
import {
  CampaignNotFoundError,
  createCampaign,
  deleteCampaign,
  getCampaignBranchId,
  listCampaigns,
  updateCampaign,
} from '../services/campaignService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof CampaignNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  return false;
}

/**
 * Branch access on edit/delete (owner decision, 2026-09-25 - found in the CRM review). Checked
 * against the CAMPAIGN's own branch, never the caller's home branch, and against the destination
 * when an edit moves it. A company-wide campaign (no branch) stays editable by anyone holding the
 * permission, exactly as before - it is created and listed that way for every branch.
 * Returns the campaign's branch id (null = company-wide), or `undefined` once a response was sent.
 */
async function authorizeCampaignBranch(req: Request<{ id: string }>, res: Response, destinationBranchId?: string | null): Promise<string | null | undefined> {
  const auth = req.auth!;
  let campaignBranchId: string | null;
  try {
    campaignBranchId = await getCampaignBranchId(req.params.id);
  } catch (err) {
    if (handleServiceError(err, res)) return undefined;
    throw err;
  }
  if ((campaignBranchId && !canAccessBranch(auth, campaignBranchId)) || (destinationBranchId && !canAccessBranch(auth, destinationBranchId))) {
    forbidBranch(res);
    return undefined;
  }
  return campaignBranchId;
}

export async function listCampaignsHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const branchIds = auth.roleNames.includes('SUPER_ADMIN') ? undefined : auth.accessibleBranchIds;
  const campaigns = await listCampaigns({ branchIds });
  res.json({ success: true, data: campaigns });
}

export async function createCampaignHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createCampaignSchema.parse(req.body);

  if (input.branchId && !canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

  const campaign = await createCampaign(input, auth.staffId);
  await recordAudit({
    entityType: 'Campaign',
    entityId: campaign.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: campaign.branchId,
    newValue: { name: campaign.name, channel: campaign.channel, budget: campaign.budget },
  });
  res.status(201).json({ success: true, data: campaign });
}

export async function updateCampaignHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateCampaignSchema.parse(req.body);
  const originalBranchId = await authorizeCampaignBranch(req, res, input.branchId);
  if (originalBranchId === undefined) return;

  try {
    const campaign = await updateCampaign(req.params.id, input);
    await recordAudit({
      entityType: 'Campaign',
      entityId: campaign.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      // the campaign's ORIGINAL branch; a branch move is visible in newValue
      branchId: originalBranchId,
      newValue: input,
    });
    res.json({ success: true, data: campaign });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function deleteCampaignHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const campaignBranchId = await authorizeCampaignBranch(req, res);
  if (campaignBranchId === undefined) return;

  try {
    await deleteCampaign(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({ entityType: 'Campaign', entityId: req.params.id, action: 'DELETE', performedById: auth.staffId, branchId: campaignBranchId });
  res.json({ success: true, data: { id: req.params.id } });
}
