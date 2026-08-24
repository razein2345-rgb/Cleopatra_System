import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import {
  approveDeviceHandler,
  blockDeviceHandler,
  deleteDeviceHandler,
  listDevicesHandler,
  logoutAllDevicesHandler,
  unblockDeviceHandler,
  updateDeviceHandler,
} from '../controllers/devices.js';

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

// SUPER_ADMIN check happens inside each handler (same pattern as
// auditLogs.ts) — no `requirePermission` here, this isn't in the regular
// permission catalog.
devicesRouter.get('/', listDevicesHandler);
devicesRouter.put('/:id/approve', approveDeviceHandler);
devicesRouter.put('/:id/block', blockDeviceHandler);
devicesRouter.put('/:id/unblock', unblockDeviceHandler);
devicesRouter.put('/:id', updateDeviceHandler);
devicesRouter.delete('/:id', deleteDeviceHandler);
devicesRouter.post('/logout-all/:staffId', logoutAllDevicesHandler);
