import { z } from 'zod';
import { workflowInstanceSchema } from './workflowInstance.js';
import { orderItemSchema, productionTrackSchema } from './order.js';

/**
 * `workflowInstance` is inlined (never a second call) — the same
 * "GET .../:id inlines its running state" precedent as `Quotation.items`
 * and `Order.items`. `productionStatus` is deliberately absent: it's
 * `@deprecated` in the schema (FEATURE-004 M1's Critical Finding) and this
 * DTO never surfaces it — `workflowInstance` is the real state.
 *
 * "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — `productionTrack` is
 * now frozen per Work Order (an Order can have several, one per track).
 * `items` is inlined too, same precedent — only the OrderItems belonging
 * to *this* Work Order, never the parent Order's full cart. This is
 * deliberate: it lets `WorkOrderDocumentPage` print exactly what this job
 * covers without fetching the whole Order and filtering, removing a whole
 * class of "forgot to filter" bugs by construction.
 */
export const workOrderSchema = z.object({
  id: z.string().uuid(),
  workOrderNumber: z.string(),
  orderId: z.string().uuid(),
  branchId: z.string().uuid(),
  productionTrack: productionTrackSchema,
  items: z.array(orderItemSchema),
  workflowInstance: workflowInstanceSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createWorkOrderSchema = z.object({
  orderId: z.string().uuid(),
  /**
   * Which track/Workflow Template to create a Work Order for — resolved
   * to its latest published version. Scopes to this order's items whose
   * own `productionTrack` matches and have no `workOrderId` yet (see
   * `workOrders.ts`'s controller) — the manual "missing tracks" fallback
   * (`GenerateWorkOrderPanel`) for a track whose template wasn't published
   * yet at order-creation time.
   */
  templateCode: z.string().trim().min(1),
  /** Same per-track "needs design?" input `createOrderSchema.requiresDesignByTrack` carries — defaults `true`. */
  requiresDesign: z.boolean().optional(),
});

export type WorkOrder = z.infer<typeof workOrderSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
