import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middlewares/requireAuth.js';
import { createAttachment } from '../controllers/attachments.js';
import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_SIZE_BYTES } from '../services/attachmentService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم — JPG أو PNG أو WEBP فقط'));
    }
  },
});

/** Turns multer's size/type rejection into the same 400 JSON shape as the rest of the API, instead of falling through to the generic 500 handler. */
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ success: false, error: { message: err instanceof Error ? err.message : 'تعذر رفع الملف' } });
      return;
    }
    next();
  });
}

export const attachmentsRouter = Router();

attachmentsRouter.use(requireAuth);
attachmentsRouter.post('/', handleUpload, createAttachment);
