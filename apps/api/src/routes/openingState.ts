import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import {
  approveCustomerOpeningHandler,
  approveSupplierOpeningHandler,
  correctCustomerOpeningCreditHandler,
  createCustomerOpeningHandler,
  createSupplierOpeningHandler,
  getCustomerOpeningHandler,
  reopenCustomerOpeningHandler,
  reopenSupplierOpeningHandler,
  updateCustomerOpeningHandler,
  updateSupplierOpeningHandler,
  verifyCustomerOpeningHandler,
  verifySupplierOpeningHandler,
} from '../controllers/openingState.js';

/** Opening State / Cutover (Phase 3C.2) — CustomerOpening/SupplierOpening, company-wide. Same "requireAuth + internal role checks" rationale as cutover.ts's own router comment. */
export const openingStateRouter = Router();
openingStateRouter.use(requireAuth);

openingStateRouter.post('/customer', createCustomerOpeningHandler);
openingStateRouter.get('/customer/:partnerId', getCustomerOpeningHandler);
openingStateRouter.put('/customer/:id', updateCustomerOpeningHandler);
openingStateRouter.put('/customer/:id/verify', verifyCustomerOpeningHandler);
openingStateRouter.post('/customer/:id/approve', approveCustomerOpeningHandler);
openingStateRouter.post('/customer/:id/reopen', reopenCustomerOpeningHandler);
// Cutover-revision-round decision (post-3D, Decision A) — SUPER_ADMIN-only, enforced inside the service.
openingStateRouter.put('/customer/:id/correct-credit', correctCustomerOpeningCreditHandler);

openingStateRouter.post('/supplier', createSupplierOpeningHandler);
openingStateRouter.put('/supplier/:id', updateSupplierOpeningHandler);
openingStateRouter.put('/supplier/:id/verify', verifySupplierOpeningHandler);
openingStateRouter.post('/supplier/:id/approve', approveSupplierOpeningHandler);
openingStateRouter.post('/supplier/:id/reopen', reopenSupplierOpeningHandler);
