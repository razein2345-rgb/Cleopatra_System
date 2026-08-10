import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  advanceWorkflowInstanceHandler,
  getWorkflowDashboardSummaryHandler,
  getWorkflowInstance,
  getWorkflowQueue,
  updateCurrentStageInstanceHandler,
} from '../controllers/workflowInstances.js';

export const workflowInstancesRouter = Router();

workflowInstancesRouter.use(requireAuth);

// /queue and /dashboard-summary must be registered before /:id —
// otherwise Express would match them as an :id param.
workflowInstancesRouter.get('/queue', requirePermission('work-orders.view'), getWorkflowQueue);
workflowInstancesRouter.get(
  '/dashboard-summary',
  requirePermission('work-orders.view'),
  getWorkflowDashboardSummaryHandler,
);
workflowInstancesRouter.get('/:id', requirePermission('work-orders.view'), getWorkflowInstance);
workflowInstancesRouter.put(
  '/:id/advance',
  requirePermission('work-orders.edit'),
  advanceWorkflowInstanceHandler,
);
workflowInstancesRouter.put(
  '/:id/current-stage',
  requirePermission('work-orders.edit'),
  updateCurrentStageInstanceHandler,
);
