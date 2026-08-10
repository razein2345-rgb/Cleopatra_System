import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createWorkflowTemplate,
  createWorkflowTemplateVersion,
  deleteWorkflowTemplate,
  getWorkflowTemplate,
  listWorkflowTemplates,
  publishWorkflowTemplate,
  updateWorkflowTemplate,
} from '../controllers/workflowTemplates.js';

export const workflowTemplatesRouter = Router();

workflowTemplatesRouter.use(requireAuth);

// FEATURE-004 M1 — top-level resource, owned by nothing (mirrors Quotation's
// own "not nested" reasoning). Administering templates (`workflow-templates.*`)
// is a separate concern from operating within them (`work-orders.edit`).
workflowTemplatesRouter.get('/', requirePermission('workflow-templates.view'), listWorkflowTemplates);
workflowTemplatesRouter.get('/:id', requirePermission('workflow-templates.view'), getWorkflowTemplate);
workflowTemplatesRouter.post('/', requirePermission('workflow-templates.create'), createWorkflowTemplate);
workflowTemplatesRouter.put('/:id', requirePermission('workflow-templates.edit'), updateWorkflowTemplate);
workflowTemplatesRouter.post(
  '/:id/publish',
  requirePermission('workflow-templates.publish'),
  publishWorkflowTemplate,
);
workflowTemplatesRouter.post(
  '/:id/versions',
  requirePermission('workflow-templates.edit'),
  createWorkflowTemplateVersion,
);
workflowTemplatesRouter.delete(
  '/:id',
  requirePermission('workflow-templates.delete'),
  deleteWorkflowTemplate,
);
