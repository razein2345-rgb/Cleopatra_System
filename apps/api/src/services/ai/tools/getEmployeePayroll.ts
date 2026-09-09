import { z } from 'zod';
import { computeEmployeePayroll, computePreviousClosedPeriod } from '../../employeePayrollService.js';
import type { AiToolDefinition } from '../toolTypes.js';

const inputSchema = z.object({
  staffId: z.string().uuid(),
});

export const getEmployeePayrollTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_employee_payroll',
  description: "Get an employee's current-period payroll calculation and their previous closed period, if any. Restricted to the business owner (SUPER_ADMIN) — same restriction as the employee profile screen.",
  requiredPermission: null,
  requiresSuperAdmin: true,
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { staffId: { type: 'string', format: 'uuid' } },
    required: ['staffId'],
    additionalProperties: false,
  },
  async execute(input) {
    const [current, previousClosed] = await Promise.all([
      computeEmployeePayroll(input.staffId),
      computePreviousClosedPeriod(input.staffId),
    ]);
    return { current, previousClosed };
  },
};
