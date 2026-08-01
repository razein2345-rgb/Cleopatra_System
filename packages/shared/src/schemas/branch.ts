import { z } from 'zod';

export const branchSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  isDefault: z.boolean(),
});

export type BranchSummary = z.infer<typeof branchSummarySchema>;
