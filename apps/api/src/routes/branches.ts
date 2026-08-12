import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { createBranch, deleteBranch, listBranches, updateBranch } from '../controllers/branches.js';

export const branchesRouter = Router();

branchesRouter.use(requireAuth);
branchesRouter.get('/', listBranches);
branchesRouter.post('/', requirePermission('settings.edit'), createBranch);
branchesRouter.put('/:id', requirePermission('settings.edit'), updateBranch);
branchesRouter.delete('/:id', requirePermission('settings.edit'), deleteBranch);
