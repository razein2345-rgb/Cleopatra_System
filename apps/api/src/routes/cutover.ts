import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import {
  activateCutoverHandler,
  approveCutoverHandler,
  createCutoverHandler,
  createInventoryOpeningHandler,
  createTreasuryOpeningHandler,
  getCutoverHandler,
  listCutoversHandler,
  reopenCutoverHandler,
  submitCutoverHandler,
  supersedeCutoverHandler,
  verifyInventoryOpeningHandler,
  verifyTreasuryOpeningHandler,
} from '../controllers/cutover.js';

/**
 * Opening State / Cutover (Phase 3C.2). Every handler enforces its own
 * branch-access and role/maker-checker checks internally (see
 * controllers/cutover.ts and services/cutoverService.ts) — deliberately
 * no permission-string gate at the route level, since a new permission
 * module would need a `prisma db seed` run this phase is not permitted to
 * perform (see the implementation report's Schema/Database Safety
 * section). `requireAuth` alone is the route-level bar; every action
 * beyond plain create/view is further restricted server-side regardless.
 *
 * Phase 3D re-audit fix — the two `/verify` routes below were the one
 * exception to that claim (identified by the line's own id, not the
 * cutover's, so they never went through the same branch check as every
 * other action here); both now resolve their parent Cutover's branch and
 * check it, same as their sibling `create` routes.
 */
export const cutoverRouter = Router();
cutoverRouter.use(requireAuth);

cutoverRouter.post('/', createCutoverHandler);
cutoverRouter.get('/', listCutoversHandler);
cutoverRouter.get('/:id', getCutoverHandler);
cutoverRouter.post('/:id/submit', submitCutoverHandler);
cutoverRouter.post('/:id/approve', approveCutoverHandler);
cutoverRouter.post('/:id/activate', activateCutoverHandler);
cutoverRouter.post('/:id/reopen', reopenCutoverHandler);
cutoverRouter.post('/:id/supersede', supersedeCutoverHandler);
cutoverRouter.post('/:id/treasury-openings', createTreasuryOpeningHandler);
cutoverRouter.post('/:id/inventory-openings', createInventoryOpeningHandler);
cutoverRouter.put('/treasury-openings/:lineId/verify', verifyTreasuryOpeningHandler);
cutoverRouter.put('/inventory-openings/:lineId/verify', verifyInventoryOpeningHandler);
