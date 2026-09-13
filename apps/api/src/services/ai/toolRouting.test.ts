import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AiConversationContext } from '@cleopatra/shared';
import type { AnyAiToolDefinition } from './toolTypes.js';
import { isToolAllowedFor, selectToolsForRequest } from './toolRouting.js';

const VALID_ID = '11111111-1111-1111-1111-111111111111';

function fakeTool(name: string, requiredPermission: string | null, requiresSuperAdmin = false): AnyAiToolDefinition {
  return {
    name,
    description: `fake ${name}`,
    requiredPermission,
    requiresSuperAdmin,
    inputSchema: z.object({}),
    inputJsonSchema: { type: 'object', properties: {} },
    execute: async () => ({}),
  } as unknown as AnyAiToolDefinition;
}

/** Mirrors the real `AI_TOOLS` registry's names/permissions (tools/index.ts) — fakes only, no real execute logic. */
const ALL_TOOLS: AnyAiToolDefinition[] = [
  fakeTool('search_customers', 'partners.view'),
  fakeTool('get_customer', 'partners.view'),
  fakeTool('get_customer_balance', 'orders.view'),
  fakeTool('get_reorder_due', 'orders.view'),
  fakeTool('search_suppliers', 'suppliers.view'),
  fakeTool('get_supplier_statement', 'suppliers.view'),
  fakeTool('get_purchase_requests_due', 'inventory.view'),
  fakeTool('search_orders', 'orders.view'),
  fakeTool('get_order', 'orders.view'),
  fakeTool('get_work_order', 'work-orders.view'),
  fakeTool('search_production_by_customer', 'work-orders.view'),
  fakeTool('get_production_status', 'work-orders.view'),
  fakeTool('search_quotations', 'quotations.view'),
  fakeTool('get_quotation', 'quotations.view'),
  fakeTool('search_inventory', 'inventory.view'),
  fakeTool('get_inventory_item', 'inventory.view'),
  fakeTool('get_treasury_summary', 'treasury.view'),
  fakeTool('get_machine_status', 'machines.view'),
  fakeTool('get_employee_payroll', null, true),
  fakeTool('search_leads', 'leads.view'),
  fakeTool('calculate_price', null),
  fakeTool('get_dashboard_summary', null),
  fakeTool('search_call_logs', 'call-logs.view'),
];

function names(tools: AnyAiToolDefinition[]): string[] {
  return tools.map((t) => t.name);
}

function auth(overrides: Partial<{ permissions: string[]; roleNames: string[] }> = {}) {
  return {
    staffId: 'staff-1',
    supabaseUserId: 'sb-1',
    name: 'Test User',
    email: 'test@example.com',
    branchId: 'branch-1',
    isActive: true,
    roleNames: overrides.roleNames ?? ['ADMIN'],
    permissions: overrides.permissions ?? ['*'],
    accessibleBranchIds: ['branch-1'],
    accessibleDepartmentIds: [],
    lastActiveAt: null,
  };
}

function context(entityType: AiConversationContext['entityType']): AiConversationContext {
  return { entityType, entityId: VALID_ID, label: 'test' };
}

describe('selectToolsForRequest — basic keyword routing', () => {
  it('customer keyword → CUSTOMERS tools only', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'هاتلي العميل أحمد'));
    expect(result).toEqual(expect.arrayContaining(['search_customers', 'get_customer', 'get_customer_balance', 'get_reorder_due']));
    expect(result).not.toContain('search_suppliers');
    expect(result).not.toContain('get_machine_status');
  });

  it('supplier keyword → SUPPLIERS tools only', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'ابحثلي عن مورد كمال'));
    expect(result).toEqual(expect.arrayContaining(['search_suppliers', 'get_supplier_statement', 'get_purchase_requests_due']));
    expect(result).not.toContain('search_customers');
  });

  it('quotation keyword → QUOTATIONS tools only', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'وريني عرض السعر'));
    expect(result).toEqual(expect.arrayContaining(['search_quotations', 'get_quotation']));
    expect(result).not.toContain('search_orders');
  });

  it('work-order keyword → WORK_ORDERS/PRODUCTION tools only', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'هات أمر الشغل'));
    expect(result).toEqual(expect.arrayContaining(['get_work_order', 'search_production_by_customer', 'get_production_status']));
    expect(result).not.toContain('search_customers');
  });

  it('inventory keyword → INVENTORY tools only', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'وريني المخزون'));
    expect(result).toEqual(expect.arrayContaining(['search_inventory', 'get_inventory_item']));
    expect(result).not.toContain('get_treasury_summary');
  });

  it('treasury keyword → TREASURY tools only', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'رصيد الخزينة'));
    expect(result).toEqual(['get_treasury_summary']);
  });
});

describe('selectToolsForRequest — Task 8.5 regression target', () => {
  it('"ابحثلي عن مورد اسمه الجعراني" never exposes search_customers', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'ابحثلي عن مورد اسمه الجعراني'));
    expect(result).not.toContain('search_customers');
    expect(result).toContain('search_suppliers');
  });
});

describe('selectToolsForRequest — keyword collisions (Step 7)', () => {
  it('a message naming both a customer and a supplier activates both domains', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'رصيد المورد اللي بيتعامل مع العميل أحمد'));
    expect(result).toEqual(expect.arrayContaining(['search_customers', 'search_suppliers']));
  });
});

describe('selectToolsForRequest — conversation context routing', () => {
  it('CUSTOMER context + "تفاصيله" (no keyword) → CUSTOMERS tools', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'طب تفاصيله؟', context('CUSTOMER')));
    expect(result).toEqual(expect.arrayContaining(['get_customer', 'search_customers']));
    expect(result).not.toContain('search_suppliers');
  });

  it('SUPPLIER context + "كشف حسابه" → SUPPLIERS tools', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'طب كشف حسابه؟', context('SUPPLIER')));
    expect(result).toEqual(expect.arrayContaining(['get_supplier_statement', 'search_suppliers']));
    expect(result).not.toContain('search_customers');
  });

  it('WORK_ORDER context + "حالته" → WORK_ORDERS/PRODUCTION tools', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'طب حالته؟', context('WORK_ORDER')));
    expect(result).toEqual(expect.arrayContaining(['get_work_order', 'get_production_status']));
    expect(result).not.toContain('search_customers');
  });

  it('QUOTATION context + "تفاصيله" → QUOTATIONS tools', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'طب تفاصيله؟', context('QUOTATION')));
    expect(result).toEqual(expect.arrayContaining(['get_quotation', 'search_quotations']));
    expect(result).not.toContain('search_orders');
  });
});

describe('selectToolsForRequest — topic change overrides stale context (Step 9)', () => {
  it('CUSTOMER context + a fresh supplier keyword routes to SUPPLIERS, not CUSTOMERS', () => {
    const result = names(selectToolsForRequest(ALL_TOOLS, auth(), 'هاتلي المورد كمال', context('CUSTOMER')));
    expect(result).toContain('search_suppliers');
    expect(result).not.toContain('search_customers');
  });
});

describe('selectToolsForRequest — ambiguous / fallback (Step 11 & 13)', () => {
  it('"ساعدني" (no domain signal) falls back to all allowed tools', () => {
    // SUPER_ADMIN so ALL 23 tools (including the requiresSuperAdmin one)
    // are genuinely allowed — isolates the fallback behavior itself from
    // the separate permission-pre-filter concern (covered below).
    const result = selectToolsForRequest(ALL_TOOLS, auth({ roleNames: ['SUPER_ADMIN'] }), 'ساعدني');
    expect(result).toHaveLength(ALL_TOOLS.length);
  });

  it('"عايز أعرف حاجة" falls back to all allowed tools', () => {
    const result = selectToolsForRequest(ALL_TOOLS, auth({ roleNames: ['SUPER_ADMIN'] }), 'عايز أعرف حاجة');
    expect(result).toHaveLength(ALL_TOOLS.length);
  });

  it('no context and no keyword falls back to all allowed tools', () => {
    const result = selectToolsForRequest(ALL_TOOLS, auth({ roleNames: ['SUPER_ADMIN'] }), '');
    expect(result).toHaveLength(ALL_TOOLS.length);
  });

  it('a tool with no domain classification is never silently excluded by an active domain filter', () => {
    const unclassified = fakeTool('unclassified_future_tool', null);
    const result = names(selectToolsForRequest([...ALL_TOOLS, unclassified], auth(), 'رصيد الخزينة'));
    expect(result).toContain('unclassified_future_tool');
  });
});

describe('selectToolsForRequest — permission pre-filter (Step 20)', () => {
  it('a user without suppliers.view never sees supplier tools, even when routing targets SUPPLIERS', () => {
    const restricted = auth({ permissions: ['partners.view', 'orders.view'] });
    const result = names(selectToolsForRequest(ALL_TOOLS, restricted, 'هاتلي المورد كمال'));
    expect(result).not.toContain('search_suppliers');
    expect(result).not.toContain('get_supplier_statement');
  });

  it('permission filtering also applies to the ambiguous fallback path', () => {
    // partners.view only → search_customers/get_customer pass; calculate_price
    // and get_dashboard_summary have no requiredPermission at all, so they
    // pass for any authenticated user regardless of granted permissions.
    const restricted = auth({ permissions: ['partners.view'] });
    const result = names(selectToolsForRequest(ALL_TOOLS, restricted, 'ساعدني'));
    expect(result).not.toContain('search_suppliers');
    expect(result).toEqual(['search_customers', 'get_customer', 'calculate_price', 'get_dashboard_summary']);
  });

  it('requiresSuperAdmin tools stay excluded for a non-SUPER_ADMIN caller regardless of routing', () => {
    const nonSuperAdmin = auth({ roleNames: ['ADMIN'], permissions: ['*'] });
    const result = names(selectToolsForRequest(ALL_TOOLS, nonSuperAdmin, 'المرتبات'));
    expect(result).not.toContain('get_employee_payroll');
  });
});

describe('isToolAllowedFor', () => {
  it('mirrors dispatchTool: requiredPermission gate', () => {
    const tool = fakeTool('search_customers', 'partners.view');
    expect(isToolAllowedFor(tool, auth({ permissions: ['partners.view'] }))).toBe(true);
    expect(isToolAllowedFor(tool, auth({ permissions: ['orders.view'] }))).toBe(false);
  });

  it('mirrors dispatchTool: requiresSuperAdmin gate', () => {
    const tool = fakeTool('get_employee_payroll', null, true);
    expect(isToolAllowedFor(tool, auth({ roleNames: ['SUPER_ADMIN'] }))).toBe(true);
    expect(isToolAllowedFor(tool, auth({ roleNames: ['ADMIN'], permissions: ['*'] }))).toBe(false);
  });

  it('a null requiredPermission with no requiresSuperAdmin is allowed for any authenticated user', () => {
    const tool = fakeTool('calculate_price', null);
    expect(isToolAllowedFor(tool, auth({ permissions: [] }))).toBe(true);
  });
});
