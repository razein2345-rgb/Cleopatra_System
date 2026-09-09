import type { Request, Response } from 'express';
import { createCampaignSchema, updateCampaignSchema } from '@cleopatra/shared';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';
import { CampaignNotFoundError, createCampaign, deleteCampaign, listCampaigns, updateCampaign } from '../services/campaignService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof CampaignNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  return false;
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

  try {
    const campaign = await updateCampaign(req.params.id, input);
    await recordAudit({
      entityType: 'Campaign',
      entityId: campaign.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      branchId: campaign.branchId,
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

  try {
    await deleteCampaign(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({ entityType: 'Campaign', entityId: req.params.id, action: 'DELETE', performedById: auth.staffId });
  res.json({ success: true, data: { id: req.params.id } });
}
