import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { createCallLogHandler, deleteCallLogHandler, listCallLogsHandler, updateCallLogHandler } from '../controllers/callLogs.js';

export const callLogsRouter = Router();

callLogsRouter.use(requireAuth);

callLogsRouter.get('/', requirePermission('call-logs.view'), listCallLogsHandler);
callLogsRouter.post('/', requirePermission('call-logs.create'), createCallLogHandler);
callLogsRouter.put('/:id', requirePermission('call-logs.edit'), updateCallLogHandler);
callLogsRouter.delete('/:id', requirePermission('call-logs.delete'), deleteCallLogHandler);
