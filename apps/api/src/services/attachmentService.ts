import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';

/**
 * FEATURE-007 — first real file-storage wiring in this codebase (the
 * `Attachment` model existed since FEATURE-003 but had no upload endpoint).
 * One bucket, public, created once by the owner in the Supabase dashboard
 * (Storage → New bucket → "attachments", Public) — this code assumes it
 * already exists rather than creating it at runtime.
 */
export const ATTACHMENT_BUCKET = 'attachments';

export const ALLOWED_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

/** Public URL for a stored object — deterministic from the bucket being public, no signed-URL round trip needed. */
export function getPublicAttachmentUrl(storagePath: string): string {
  return `${env.SUPABASE_URL}/storage/v1/object/public/${ATTACHMENT_BUCKET}/${storagePath}`;
}

export class AttachmentUploadError extends Error {}

/** Uploads one already-validated (mimetype/size) file buffer, returns the storage key. */
export async function uploadAttachmentFile(
  buffer: Buffer,
  originalFileName: string,
  mimeType: string,
): Promise<string> {
  const extension = originalFileName.includes('.') ? originalFileName.split('.').pop() : undefined;
  const storagePath = `order-items/${randomUUID()}${extension ? `.${extension}` : ''}`;

  const { error } = await supabaseAdmin.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (error) {
    throw new AttachmentUploadError(error.message);
  }

  return storagePath;
}
