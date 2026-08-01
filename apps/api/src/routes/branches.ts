import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { listBranches } from '../controllers/branches.js';

export const branchesRouter = Router();

branchesRouter.use(requireAuth);
branchesRouter.get('/', listBranches);
