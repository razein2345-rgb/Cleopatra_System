import { z } from 'zod';
import { hasPermission } from '@cleopatra/shared';
import { accessibleDepartmentScope } from '../../authContext.js';
import { getWorkflowDashboardSummary } from '../../workflowInstanceService.js';
import { getCompanyFinancialSummary } from '../../branchFinancialsService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Composes several existing dashboard summaries, each gated on its own
 * permission (CLEOPATRA_AI_TOOLS.md) — no single fixed
 * `requiredPermission` at the dispatcher level, since a caller may
 * legitimately see production status but not financials, or neither.
 */
const inputSchema = z.object({});

export const getDashboardSummaryTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_dashboard_summary',
  description: 'Get a combined snapshot of production status and company financials — each section is only included if the caller has permission for it.',
  requiredPermission: null,
  inputSchema,
  inputJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute(_input, ctx) {
    const sections: Record<string, unknown> = {};

    if (hasPermission(ctx.auth.permissions, 'work-orders.view')) {
      sections.production = await getWorkflowDashboardSummary(accessibleDepartmentScope(ctx.auth));
    }

    if (hasPermission(ctx.auth.permissions, 'reports.view')) {
      const branchIds = ctx.auth.roleNames.includes('SUPER_ADMIN') ? undefined : ctx.auth.accessibleBranchIds;
      sections.financials = await getCompanyFinancialSummary(branchIds);
    }

    if (Object.keys(sections).length === 0) {
      return { error: 'محتاج على الأقل صلاحية عرض الإنتاج أو التقارير عشان أقدر أعرض أي ملخص' };
    }

    return sections;
  },
};
