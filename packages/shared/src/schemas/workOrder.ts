import { z } from 'zod';
import { workflowInstanceSchema } from './workflowInstance.js';

/**
 * `workflowInstance` is inlined (never a second call) — the same
 * "GET .../:id inlines its running state" precedent as `Quotation.items`
 * and `Order.items`. `productionStatus` is deliberately absent: it's
 * `@deprecated` in the schema (FEATURE-004 M1's Critical Finding) and this
 * DTO never surfaces it — `workflowInstance` is the real state.
 */
export const workOrderSchema = z.object({
  id: z.string().uuid(),
  workOrderNumber: z.string(),
  orderId: z.string().uuid(),
  branchId: z.string().uuid(),
  workflowInstance: workflowInstanceSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createWorkOrderSchema = z.object({
  orderId: z.string().uuid(),
  /** Which Workflow Template to start — resolved to its latest published version. */
  templateCode: z.string().trim().min(1),
});

export type WorkOrder = z.infer<typeof workOrderSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
