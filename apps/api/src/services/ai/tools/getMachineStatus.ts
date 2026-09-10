import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Phase 2 Task 6 (owner-approved, 2026-09-10). Same contradiction class
 * already documented for Phase 1's `search_orders`/`get_order`: the real
 * function is `controllers/machines.ts::listMachines`, a controller-level
 * query with no separate service layer — reused here verbatim (identical
 * `where`/`orderBy`), no new business logic. `Machine` is deliberately a
 * lightweight name/branch/department/status catalog (schema.prisma's own
 * doc comment) — no Capacity Rate/Scheduled-Hours fields exist to read.
 */
const inputSchema = z.object({
  branchId: z.string().uuid().optional(),
});

export const getMachineStatusTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_machine_status',
  description: 'List machines and their current status (RUNNING/STOPPED/MAINTENANCE), optionally filtered to one branch.',
  requiredPermission: 'machines.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { branchId: { type: 'string', format: 'uuid' } },
    additionalProperties: false,
  },
  async execute(input) {
    return prisma.machine.findMany({
      where: { isDeleted: false, ...(input.branchId ? { branchId: input.branchId } : {}) },
      orderBy: { name: 'asc' },
    });
  },
};
