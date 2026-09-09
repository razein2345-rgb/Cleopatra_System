import { z } from 'zod';

/**
 * Owner (2026-09-09, "المرحلة الخامسة" → "تقويم المحتوى") — internal
 * scheduling/tracking of planned social-media content, deliberately NOT a
 * real publishing integration (رول 8 — أي تكامل خارجي قابل للفصل ومربوط
 * بأذونات API فعلية؛ مفيش API رسمي متاح دلوقتي لأي منصة). `publishedUrl`
 * is filled in manually once a human actually posts it elsewhere. See
 * `ContentCalendarEntry`'s own schema.prisma doc comment.
 */
export const contentPlatformSchema = z.enum(['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WHATSAPP_STATUS', 'OTHER']);
export const contentCalendarStatusSchema = z.enum(['IDEA', 'IN_PROGRESS', 'READY', 'PUBLISHED', 'CANCELLED']);

export const contentCalendarEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  platform: contentPlatformSchema,
  contentType: z.string().nullable(),
  notes: z.string().nullable(),
  publishedUrl: z.string().nullable(),
  scheduledDate: z.string(),
  status: contentCalendarStatusSchema,
  branchId: z.string().uuid().nullable(),
  assignedToId: z.string().uuid().nullable(),
  assignedToName: z.string().nullable(),
  recordedById: z.string().uuid(),
  recordedByName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createContentCalendarEntrySchema = z.object({
  title: z.string().trim().min(1).max(200),
  platform: contentPlatformSchema,
  contentType: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  scheduledDate: z.string(),
  status: contentCalendarStatusSchema.optional(),
  branchId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
});

export const updateContentCalendarEntrySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  platform: contentPlatformSchema.optional(),
  contentType: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  publishedUrl: z.string().trim().max(500).nullable().optional(),
  scheduledDate: z.string().optional(),
  status: contentCalendarStatusSchema.optional(),
  branchId: z.string().uuid().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

export type ContentPlatform = z.infer<typeof contentPlatformSchema>;
export type ContentCalendarStatus = z.infer<typeof contentCalendarStatusSchema>;
export type ContentCalendarEntry = z.infer<typeof contentCalendarEntrySchema>;
export type CreateContentCalendarEntryInput = z.infer<typeof createContentCalendarEntrySchema>;
export type UpdateContentCalendarEntryInput = z.infer<typeof updateContentCalendarEntrySchema>;
