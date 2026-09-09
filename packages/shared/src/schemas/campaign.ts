import { z } from 'zod';

/**
 * Owner (2026-09-09, "المرحلة الخامسة" → "كمل في الأسرع فيهم") — Phase 5's
 * Campaign Management piece (system_specifications_v2.md §10.1). v1 ships
 * real budget/performance tracking with leads/quotes/orders/revenue
 * entered manually — a real join to `Lead`/`Order` for automatic
 * attribution needs a new `Lead.campaignId` FK and cross-model
 * aggregation, a bigger change than "the faster one" calls for. Cost-per-
 * lead and ROI are derived client-side from these numbers, never stored.
 */
export const campaignChannelSchema = z.enum(['SOCIAL_MEDIA', 'GOOGLE_ADS', 'SMS', 'EMAIL', 'PRINT', 'EVENT', 'OTHER']);
export const campaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']);

export const campaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  channel: campaignChannelSchema,
  status: campaignStatusSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  budget: z.number().nullable(),
  leadsGenerated: z.number().int().nullable(),
  quotesGenerated: z.number().int().nullable(),
  ordersGenerated: z.number().int().nullable(),
  revenue: z.number().nullable(),
  notes: z.string().nullable(),
  branchId: z.string().uuid().nullable(),
  recordedById: z.string().uuid(),
  recordedByName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  channel: campaignChannelSchema,
  status: campaignStatusSchema.optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  budget: z.number().nonnegative().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  branchId: z.string().uuid().optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  channel: campaignChannelSchema.optional(),
  status: campaignStatusSchema.optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  budget: z.number().nonnegative().nullable().optional(),
  leadsGenerated: z.number().int().nonnegative().nullable().optional(),
  quotesGenerated: z.number().int().nonnegative().nullable().optional(),
  ordersGenerated: z.number().int().nonnegative().nullable().optional(),
  revenue: z.number().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
});

export type CampaignChannel = z.infer<typeof campaignChannelSchema>;
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
