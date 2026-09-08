import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import {
  advanceLeadStageHandler,
  convertLeadHandler,
  createLeadHandler,
  deleteLeadHandler,
  getLeadHandler,
  importLeadsHandler,
  listLeadsHandler,
  parseLeadImportHandler,
  rejectLeadHandler,
  updateLeadHandler,
} from '../controllers/leads.js';

const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES } });

/** Turns multer's size-limit rejection into the same 400 JSON shape as the rest of the API, instead of falling through to the generic 500 handler. */
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ success: false, error: { message: err instanceof Error ? err.message : 'تعذر رفع الملف' } });
      return;
    }
    next();
  });
}

export const leadsRouter = Router();

leadsRouter.use(requireAuth);

leadsRouter.get('/', requirePermission('leads.view'), listLeadsHandler);
leadsRouter.get('/:id', requirePermission('leads.view'), getLeadHandler);
leadsRouter.post('/', requirePermission('leads.create'), createLeadHandler);
leadsRouter.post('/import/parse', requirePermission('leads.create'), handleUpload, parseLeadImportHandler);
leadsRouter.post('/import', requirePermission('leads.create'), importLeadsHandler);
leadsRouter.put('/:id', requirePermission('leads.edit'), updateLeadHandler);
leadsRouter.put('/:id/stage', requirePermission('leads.edit'), advanceLeadStageHandler);
leadsRouter.post('/:id/reject', requirePermission('leads.edit'), rejectLeadHandler);
// Owner (2026-08-20, "زرار 'اعمله عرض سعر' من شاشة الـLead") — its own
// permission, mirroring quotations.convert, since this creates a real
// BusinessPartner as a side effect, a materially different action from
// editing the Lead's own fields.
leadsRouter.post('/:id/convert', requirePermission('leads.convert'), convertLeadHandler);
leadsRouter.delete('/:id', requirePermission('leads.delete'), deleteLeadHandler);
