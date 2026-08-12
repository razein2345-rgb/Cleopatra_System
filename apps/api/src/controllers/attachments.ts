import type { Request, Response } from 'express';
import { hasPermission, type Attachment } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { getPublicAttachmentUrl, uploadAttachmentFile } from '../services/attachmentService.js';

/**
 * FEATURE-007 — one shared upload endpoint for every image the system
 * accepts: the order/quotation item form's reference-image dropzone
 * (video's "صورة المنتج") AND the business logo (Settings → الهوية
 * التجارية). Gated on any one of `orders.create`/`quotations.create`/
 * `settings.edit` rather than a single `requirePermission` key, since
 * different callers reach this for different reasons.
 */
export async function createAttachment(req: Request, res: Response) {
  if (!req.auth) {
    res.status(401).json({ success: false, error: { message: 'Missing bearer token' } });
    return;
  }
  const allowed = ['orders.create', 'quotations.create', 'settings.edit'].some((key) =>
    hasPermission(req.auth!.permissions, key),
  );
  if (!allowed) {
    res.status(403).json({ success: false, error: { message: 'Missing required permission' } });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: { message: 'لم يتم إرفاق أي ملف' } });
    return;
  }

  const category = typeof req.body.category === 'string' ? req.body.category : null;
  const storagePath = await uploadAttachmentFile(file.buffer, file.originalname, file.mimetype);

  const created = await prisma.attachment.create({
    data: {
      fileName: file.originalname,
      fileType: file.mimetype,
      storagePath,
      sizeBytes: file.size,
      category,
      uploadedById: req.auth.staffId,
    },
  });

  const dto: Attachment = {
    id: created.id,
    fileName: created.fileName,
    fileType: created.fileType,
    url: getPublicAttachmentUrl(storagePath),
    sizeBytes: created.sizeBytes,
    category: created.category,
    createdAt: created.createdAt.toISOString(),
  };
  res.status(201).json({ success: true, data: dto });
}
