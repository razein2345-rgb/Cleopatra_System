import type { Request, Response } from 'express';
import { hasPermission, type Attachment } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { getPublicAttachmentUrl, uploadAttachmentFile } from '../services/attachmentService.js';

/**
 * FEATURE-007 — reference-image upload for the order/quotation item form
 * (video's "صورة المنتج" dropzone). Gated on either `orders.create` or
 * `quotations.create` (matching the frontend's own OR-permission gate on
 * `/orders/new` in App.tsx) rather than a single `requirePermission` key,
 * since this single endpoint serves both creation flows.
 */
export async function createAttachment(req: Request, res: Response) {
  if (!req.auth) {
    res.status(401).json({ success: false, error: { message: 'Missing bearer token' } });
    return;
  }
  if (!hasPermission(req.auth.permissions, 'orders.create') && !hasPermission(req.auth.permissions, 'quotations.create')) {
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
