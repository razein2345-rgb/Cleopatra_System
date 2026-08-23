import { z } from 'zod';
import { leadSourceSchema } from './businessPartner.js';

/**
 * PRODUCT_ROADMAP.md §2 ("المرحلة الثانية") — a Lead is a separate,
 * lighter-weight entity from BusinessPartner, not a BusinessPartner row
 * with a PROSPECT status (owner's own framing: "Lead ككيان منفصل عن
 * العميل"). Deliberately reuses `leadSourceSchema` from businessPartner.ts
 * (same enum, same meaning) rather than a second copy.
 *
 * Owner (2026-08-20, "طالما مطلبش قبل كده ومعندوش طلبات المفروض يفضل في
 * الليدز لحد ما يقبل اول عرض السعر") — a Lead stays a Lead through the
 * whole quoting/negotiation phase; converting to a real BusinessPartner
 * (status: PROSPECT, not ACTIVE) only happens the moment staff are ready
 * to actually build a real Quotation for them (the "اعمل عرض سعر" action
 * on the Lead screen does both atomically) — never a separate manual
 * "convert" step with no quotation behind it. `stage: CONVERTED` therefore
 * means "now tracked as a BusinessPartner," not "confirmed as a paying
 * customer" — that distinction is `BusinessPartner.status`
 * (PROSPECT → ACTIVE once they actually accept a quotation and it becomes
 * a real Order), already-existing infrastructure this feature reuses
 * rather than duplicating.
 */
export const leadStageSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'REJECTED']);

export const leadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().nullable(),
  source: leadSourceSchema.nullable(),
  stage: leadStageSchema,
  notes: z.string().nullable(),
  branchId: z.string().uuid(),
  assignedToId: z.string().uuid().nullable(),
  recordedById: z.string().uuid(),
  nextFollowUpAt: z.string().nullable(),
  convertedPartnerId: z.string().uuid().nullable(),
  rejectedReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(50),
  email: z.string().email().optional(),
  source: leadSourceSchema.optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
  branchId: z.string().uuid(),
  assignedToId: z.string().uuid().optional(),
  nextFollowUpAt: z.string().optional(),
});

/** `stage` is deliberately absent — CONTACTED/QUALIFIED progression happens via `advanceLeadStage`, CONVERTED/REJECTED only via their own dedicated actions (same "no direct status field on the generic update" precedent `updateQuotationSchema` already sets). */
export const updateLeadSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(1).max(50).optional(),
  email: z.string().email().nullable().optional(),
  source: leadSourceSchema.nullable().optional(),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
  branchId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
});

/** Advances an open Lead one step (NEW → CONTACTED → QUALIFIED) — never jumps straight to CONVERTED/REJECTED, those are their own dedicated actions below. */
export const advanceLeadStageSchema = z.object({
  stage: z.enum(['CONTACTED', 'QUALIFIED']),
});

export const rejectLeadSchema = z.object({
  reason: z.string().trim().min(1).max(1000).optional(),
});

export type LeadStage = z.infer<typeof leadStageSchema>;
export type Lead = z.infer<typeof leadSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type AdvanceLeadStageInput = z.infer<typeof advanceLeadStageSchema>;
export type RejectLeadInput = z.infer<typeof rejectLeadSchema>;
