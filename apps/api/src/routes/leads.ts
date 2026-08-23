import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  advanceLeadStageHandler,
  convertLeadHandler,
  createLeadHandler,
  deleteLeadHandler,
  getLeadHandler,
  listLeadsHandler,
  rejectLeadHandler,
  updateLeadHandler,
} from '../controllers/leads.js';

export const leadsRouter = Router();

leadsRouter.use(requireAuth);

leadsRouter.get('/', requirePermission('leads.view'), listLeadsHandler);
leadsRouter.get('/:id', requirePermission('leads.view'), getLeadHandler);
leadsRouter.post('/', requirePermission('leads.create'), createLeadHandler);
leadsRouter.put('/:id', requirePermission('leads.edit'), updateLeadHandler);
leadsRouter.put('/:id/stage', requirePermission('leads.edit'), advanceLeadStageHandler);
leadsRouter.post('/:id/reject', requirePermission('leads.edit'), rejectLeadHandler);
// Owner (2026-08-20, "زرار 'اعمله عرض سعر' من شاشة الـLead") — its own
// permission, mirroring quotations.convert, since this creates a real
// BusinessPartner as a side effect, a materially different action from
// editing the Lead's own fields.
leadsRouter.post('/:id/convert', requirePermission('leads.convert'), convertLeadHandler);
leadsRouter.delete('/:id', requirePermission('leads.delete'), deleteLeadHandler);
