import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { createMachine, deleteMachine, listMachines, updateMachine } from '../controllers/machines.js';

export const machinesRouter = Router();

machinesRouter.use(requireAuth);

machinesRouter.get('/', requirePermission('machines.view'), listMachines);
machinesRouter.post('/', requirePermission('machines.edit'), createMachine);
machinesRouter.put('/:id', requirePermission('machines.edit'), updateMachine);
machinesRouter.delete('/:id', requirePermission('machines.delete'), deleteMachine);
