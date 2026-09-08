import { z } from 'zod';

/**
 * Owner (2026-09-08, "عايز صفحة يكون عندي قابلية فيها إني اعمل Embed
 * للمواقع فيها زي نوشن... افتح كل وسائل التواصل بتاعتي من السيستم") — an
 * admin-managed list of quick-launch links (WhatsApp Web, Facebook page,
 * Instagram, email, ...), opened in a new tab from one page. True iframe
 * embedding of those sites is blocked by their own X-Frame-Options/CSP —
 * see the model's own doc comment in schema.prisma for the full reasoning
 * and the owner's explicit acceptance of this alternative.
 */
export const communicationHubLinkSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  url: z.string().min(1),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createCommunicationHubLinkSchema = z.object({
  label: z.string().trim().min(1).max(100),
  url: z.string().trim().min(1).max(500),
});

export const updateCommunicationHubLinkSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  url: z.string().trim().min(1).max(500).optional(),
});

export const moveCommunicationHubLinkSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export type CommunicationHubLink = z.infer<typeof communicationHubLinkSchema>;
export type CreateCommunicationHubLinkInput = z.infer<typeof createCommunicationHubLinkSchema>;
export type UpdateCommunicationHubLinkInput = z.infer<typeof updateCommunicationHubLinkSchema>;
export type MoveCommunicationHubLinkInput = z.infer<typeof moveCommunicationHubLinkSchema>;
