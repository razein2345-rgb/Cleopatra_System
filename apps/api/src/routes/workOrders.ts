import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { createWorkOrder, getWorkOrder, listWorkOrders } from '../controllers/workOrders.js';

export const workOrdersRouter = Router();

workOrdersRouter.use(requireAuth);

// FEATURE-004 M1 — first-ever WorkOrder application code: create (from an
// Order, onto a published Workflow Template) + read, inlining its
// WorkflowInstance. No edit/delete — a full Work Order module is future
// work (00_REQUIREMENTS.md §3).
// Creating a WorkOrder starts production — the same weight as advancing a
// stage, so it's gated on `work-orders.edit`, not `.view` (there is no
// `work-orders.create` in the catalog; Phase 2 only ever seeded
// view/edit/delete for this module).
// FEATURE-007 — `listWorkOrders` (the "المستندات" unified list) added here.
workOrdersRouter.get('/', requirePermission('work-orders.view'), listWorkOrders);
workOrdersRouter.post('/', requirePermission('work-orders.edit'), createWorkOrder);
workOrdersRouter.get('/:id', requirePermission('work-orders.view'), getWorkOrder);
