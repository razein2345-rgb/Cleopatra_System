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
  /**
   * Which Workflow Template to start — resolved to its latest published
   * version. Optional as of FEATURE-007 WF-B: omit it to auto-resolve
   * from the order's own `productionTrack` (the track chosen at order
   * creation, per the owner's "differentiate from the start" decision);
   * still overridable by passing it explicitly (e.g. an older order with
   * no `productionTrack` set).
   */
  templateCode: z.string().trim().min(1).optional(),
});

export type WorkOrder = z.infer<typeof workOrderSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
