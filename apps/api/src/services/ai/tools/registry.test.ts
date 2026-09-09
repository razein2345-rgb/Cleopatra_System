import { describe, expect, it } from 'vitest';
import { AI_TOOLS } from './index.js';

/**
 * A declarative lock on the Phase 1 security model (CLEOPATRA_AI_TOOLS.md /
 * CLEOPATRA_AI_SECURITY.md §2) — exactly the 16 approved READ tools, each
 * with the exact permission (or SUPER_ADMIN gate) the catalog specifies.
 * A future edit that accidentally widens or removes a permission check
 * fails this test immediately, without needing a live LLM call.
 */
const EXPECTED = {
  search_customers: { requiredPermission: 'partners.view', requiresSuperAdmin: undefined },
  get_customer: { requiredPermission: 'partners.view', requiresSuperAdmin: undefined },
  get_customer_balance: { requiredPermission: 'orders.view', requiresSuperAdmin: undefined },
  search_leads: { requiredPermission: 'leads.view', requiresSuperAdmin: undefined },
  search_orders: { requiredPermission: 'orders.view', requiresSuperAdmin: undefined },
  get_order: { requiredPermission: 'orders.view', requiresSuperAdmin: undefined },
  get_work_order: { requiredPermission: 'work-orders.view', requiresSuperAdmin: undefined },
  get_production_status: { requiredPermission: 'work-orders.view', requiresSuperAdmin: undefined },
  get_treasury_summary: { requiredPermission: 'treasury.view', requiresSuperAdmin: undefined },
  search_inventory: { requiredPermission: 'inventory.view', requiresSuperAdmin: undefined },
  get_inventory_item: { requiredPermission: 'inventory.view', requiresSuperAdmin: undefined },
  calculate_price: { requiredPermission: null, requiresSuperAdmin: undefined },
  search_call_logs: { requiredPermission: 'call-logs.view', requiresSuperAdmin: undefined },
  get_reorder_due: { requiredPermission: 'orders.view', requiresSuperAdmin: undefined },
  get_dashboard_summary: { requiredPermission: null, requiresSuperAdmin: undefined },
  get_employee_payroll: { requiredPermission: null, requiresSuperAdmin: true },
} as const;

describe('AI_TOOLS registry (Phase 1)', () => {
  it('contains exactly the 16 approved READ tools, no more, no fewer', () => {
    expect(AI_TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('every tool name is unique', () => {
    const names = AI_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every tool carries exactly the approved permission gate', () => {
    for (const tool of AI_TOOLS) {
      const expected = EXPECTED[tool.name as keyof typeof EXPECTED];
      expect(tool.requiredPermission, `${tool.name}.requiredPermission`).toBe(expected.requiredPermission);
      expect(tool.requiresSuperAdmin, `${tool.name}.requiresSuperAdmin`).toBe(expected.requiresSuperAdmin);
    }
  });

  it('every tool has a non-empty description and a JSON Schema input hint', () => {
    for (const tool of AI_TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(10);
      expect(tool.inputJsonSchema, tool.name).toMatchObject({ type: 'object' });
    }
  });
});
