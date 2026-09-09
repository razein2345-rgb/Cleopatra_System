import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { createCampaignHandler, deleteCampaignHandler, listCampaignsHandler, updateCampaignHandler } from '../controllers/campaigns.js';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth);

campaignsRouter.get('/', requirePermission('campaigns.view'), listCampaignsHandler);
campaignsRouter.post('/', requirePermission('campaigns.create'), createCampaignHandler);
campaignsRouter.put('/:id', requirePermission('campaigns.edit'), updateCampaignHandler);
campaignsRouter.delete('/:id', requirePermission('campaigns.delete'), deleteCampaignHandler);
