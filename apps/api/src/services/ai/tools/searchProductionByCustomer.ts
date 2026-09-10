import { z } from 'zod';
import { accessibleDepartmentScope } from '../../authContext.js';
import { getAllQueue } from '../../workflowInstanceService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Phase 2 Task 3 (owner-approved, 2026-09-10) — fills the exact gap Test 2
 * of the live multi-tool test surfaced: "طلبات عميل X في مرحلة Y" is a
 * production-stage question, not an Order/invoice-status one, so
 * `search_orders` could never answer it. `getAllQueue()` is the existing
 * function that already powers لوحة الإنتاج's "الأقسام" (All) tab — the
 * exact screen used to verify both live tests' ground truth — and it
 * already returns `customerName`/`stageName`/`departmentName` per row.
 * This tool is a thin wrapper: call it, filter in-memory, done. No new
 * Prisma query, no new business logic (same reuse pattern as Phase 1's
 * `search_orders`/`search_quotations`).
 *
 * `accessibleDepartmentScope(ctx.auth)` is applied FIRST, at the
 * `getAllQueue()` call itself — the model never supplies a department or
 * branch id, and the input schema below has no such field, so there is no
 * value an LLM could pass that would ever widen this beyond what
 * `get_production_status` (Phase 1) already scopes the identical caller to.
 */
const inputSchema = z.object({
  customerName: z.string().trim().min(1).max(200).optional().describe('Free-text match on customer name'),
  stageName: z.string().trim().min(1).max(200).optional().describe('Free-text match on production stage/department name, e.g. التصميم'),
});

export const searchProductionByCustomerTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_production_by_customer',
  description:
    'Search open production jobs (work order stage instances) by customer name and/or production stage/department name — e.g. "which of customer X\'s jobs are still in the design stage". Read-only, scoped to the caller\'s own accessible departments.',
  requiredPermission: 'work-orders.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: {
      customerName: { type: 'string', description: 'Free-text match on customer name' },
      stageName: { type: 'string', description: 'Free-text match on production stage/department name, e.g. التصميم' },
    },
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const items = await getAllQueue(accessibleDepartmentScope(ctx.auth));

    let filtered = items;
    if (input.customerName) {
      const q = input.customerName.toLowerCase();
      filtered = filtered.filter((item) => item.customerName?.toLowerCase().includes(q));
    }
    if (input.stageName) {
      const q = input.stageName.toLowerCase();
      filtered = filtered.filter(
        (item) => item.stageName.toLowerCase().includes(q) || (item.departmentName?.toLowerCase().includes(q) ?? false),
      );
    }

    return filtered.slice(0, 20).map((item) => ({
      workOrderId: item.workOrderId,
      workOrderNumber: item.workOrderNumber,
      customerName: item.customerName,
      itemNames: item.itemNames,
      stageName: item.stageName,
      departmentName: item.departmentName,
      status: item.status,
      isDelayed: item.isDelayed,
      priority: item.priority,
      dueDate: item.dueDate,
    }));
  },
};
