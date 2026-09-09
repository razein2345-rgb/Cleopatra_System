import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  createContentCalendarEntryHandler,
  deleteContentCalendarEntryHandler,
  listContentCalendarEntriesHandler,
  updateContentCalendarEntryHandler,
} from '../controllers/contentCalendar.js';

export const contentCalendarRouter = Router();

contentCalendarRouter.use(requireAuth);

contentCalendarRouter.get('/', requirePermission('content-calendar.view'), listContentCalendarEntriesHandler);
contentCalendarRouter.post('/', requirePermission('content-calendar.create'), createContentCalendarEntryHandler);
contentCalendarRouter.put('/:id', requirePermission('content-calendar.edit'), updateContentCalendarEntryHandler);
contentCalendarRouter.delete('/:id', requirePermission('content-calendar.delete'), deleteContentCalendarEntryHandler);
