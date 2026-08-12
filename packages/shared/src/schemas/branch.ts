import { z } from 'zod';

export const branchSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  address: z.string().nullable(),
  isDefault: z.boolean(),
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
});

export type BranchSummary = z.infer<typeof branchSummarySchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
