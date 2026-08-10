import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  convertQuotation,
  createQuotation,
  createQuotationVersion,
  deleteQuotation,
  getQuotation,
  listQuotations,
  setQuotationApprovalState,
  setQuotationStatus,
  updateQuotation,
} from '../controllers/quotations.js';

export const quotationsRouter = Router();

quotationsRouter.use(requireAuth);

// FEATURE-003 M1 — top-level resource, not nested under /partners, since a
// Quotation references a partner but is not owned/scoped by it the way
// Contacts/Addresses/Notes are (01_ANALYSIS.md's Service Boundaries note).
quotationsRouter.get('/', requirePermission('quotations.view'), listQuotations);
quotationsRouter.get('/:id', requirePermission('quotations.view'), getQuotation);
quotationsRouter.post('/', requirePermission('quotations.create'), createQuotation);
quotationsRouter.put('/:id', requirePermission('quotations.edit'), updateQuotation);
quotationsRouter.put(
  '/:id/status',
  requirePermission('quotations.edit'),
  setQuotationStatus,
);
quotationsRouter.put(
  '/:id/approval',
  requirePermission('quotations.edit'),
  setQuotationApprovalState,
);
quotationsRouter.post(
  '/:id/versions',
  requirePermission('quotations.edit'),
  createQuotationVersion,
);
// FEATURE-003 M2 — its own permission (`quotations.convert`, seeded since
// Phase 2, unused until now), not `quotations.edit` — converting is a
// materially different, one-way action from editing a draft.
quotationsRouter.post('/:id/convert', requirePermission('quotations.convert'), convertQuotation);
quotationsRouter.delete('/:id', requirePermission('quotations.delete'), deleteQuotation);
