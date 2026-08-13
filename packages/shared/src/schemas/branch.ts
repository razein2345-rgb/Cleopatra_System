import { z } from 'zod';

export const branchSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  address: z.string().nullable(),
  isDefault: z.boolean(),
  /** FEATURE-007 (2026-08-12) — per-branch letterhead identity; each null field falls back to the global business identity on documents issued from this branch. */
  logoUrl: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  landlinePhone: z.string().nullable(),
  facebookUrl: z.string().nullable(),
  stampUrl: z.string().nullable(),
  tagline: z.string().nullable(),
});

/** FEATURE-007 — branch management in Settings (owner, 2026-08-12: "عايز مكان في الإعدادات إني اضيف إسم الفروع"). `code` stays a plain unique short string, not auto-derived — matches how every other Settings catalog (Service/ReadyProduct/SheetType) takes its identifying fields directly from the form. */
export const createBranchSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(20),
  address: z.string().trim().min(1).max(300).optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  address: z.string().trim().min(1).max(300).nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  phone: z.string().trim().min(1).max(50).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  landlinePhone: z.string().trim().min(1).max(50).nullable().optional(),
  facebookUrl: z.string().trim().min(1).max(300).nullable().optional(),
  stampUrl: z.string().nullable().optional(),
  tagline: z.string().trim().min(1).max(200).nullable().optional(),
});

export type BranchSummary = z.infer<typeof branchSummarySchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
