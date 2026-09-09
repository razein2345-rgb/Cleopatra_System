import { z } from 'zod';
import { accessibleDepartmentScope } from '../../authContext.js';
import { getWorkflowDashboardSummary } from '../../workflowInstanceService.js';
import type { AiToolDefinition } from '../toolTypes.js';

const inputSchema = z.object({});

export const getProductionStatusTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_production_status',
  description: 'Get an overview of current production: how many jobs are waiting, in progress, or delayed, broken down by department.',
  requiredPermission: 'work-orders.view',
  inputSchema,
  inputJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute(_input, ctx) {
    const scope = accessibleDepartmentScope(ctx.auth);
    return getWorkflowDashboardSummary(scope);
  },
};
