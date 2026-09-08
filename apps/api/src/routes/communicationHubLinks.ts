import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createCommunicationHubLinkHandler,
  deleteCommunicationHubLinkHandler,
  listCommunicationHubLinksHandler,
  moveCommunicationHubLinkHandler,
  updateCommunicationHubLinkHandler,
} from '../controllers/communicationHubLinks.js';

export const communicationHubLinksRouter = Router();

communicationHubLinksRouter.use(requireAuth);

// Viewing (actually using the links to reach WhatsApp/Facebook/etc.) is
// open to any authenticated staff member — deliberately NOT gated behind
// settings.view, since the people who most need this page (reception/sales
// replying to customers) don't typically hold that permission. Only
// managing the list (add/edit/reorder/delete) requires settings.edit, the
// same convention every other admin-managed catalog in this app uses.
communicationHubLinksRouter.get('/', listCommunicationHubLinksHandler);
communicationHubLinksRouter.post('/', requirePermission('settings.edit'), createCommunicationHubLinkHandler);
communicationHubLinksRouter.put('/:id', requirePermission('settings.edit'), updateCommunicationHubLinkHandler);
communicationHubLinksRouter.post('/:id/move', requirePermission('settings.edit'), moveCommunicationHubLinkHandler);
communicationHubLinksRouter.delete('/:id', requirePermission('settings.edit'), deleteCommunicationHubLinkHandler);
