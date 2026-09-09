import { z } from 'zod';
import { listCallLogs } from '../../callLogService.js';
import type { AiToolDefinition } from '../toolTypes.js';

const inputSchema = z.object({
  partnerId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
});

export const searchCallLogsTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_call_logs',
  description: 'Search recorded call logs, optionally filtered to one customer or one lead.',
  requiredPermission: 'call-logs.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: {
      partnerId: { type: 'string', format: 'uuid' },
      leadId: { type: 'string', format: 'uuid' },
    },
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const branchIds = ctx.auth.roleNames.includes('SUPER_ADMIN') ? undefined : ctx.auth.accessibleBranchIds;
    const logs = await listCallLogs({ partnerId: input.partnerId, leadId: input.leadId, branchIds });
    return logs.slice(0, 20);
  },
};
