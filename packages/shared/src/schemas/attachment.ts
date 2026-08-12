import { z } from 'zod';

/**
 * FEATURE-007 — first working upload flow in the system (schema for
 * `Attachment` existed since FEATURE-003 but had no endpoint until now).
 * `url` is server-resolved (Supabase Storage public URL from
 * `storagePath`), never client-supplied — the order-creation screen embeds
 * this straight into an `<img>` src on the printed Work Order, so trusting
 * a client string here would be an XSS vector.
 */
export const attachmentSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  fileType: z.string(),
  url: z.string(),
  sizeBytes: z.number().nullable(),
  category: z.string().nullable(),
  createdAt: z.string(),
});

export type Attachment = z.infer<typeof attachmentSchema>;
