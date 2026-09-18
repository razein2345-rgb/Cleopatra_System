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

/**
 * Task 14.2 — dedicated system-help intent lane. Uses its own local tools
 * array (`TOOLS_WITH_HELP`), never mutating the shared `ALL_TOOLS` used by
 * every test above — `search_help_topics` didn't exist when those tests
 * were written, and several of them (the fallback/permission-pre-filter
 * ones) hardcode exact expected arrays/lengths derived from `ALL_TOOLS`'s
 * own contents; adding a tool to that shared constant would silently
 * change what several unrelated, already-passing tests are asserting.
 */
describe('selectToolsForRequest — Task 14.2 system-help intent routing', () => {
  const HELP_TOOL = fakeTool('search_help_topics', null);
  const TOOLS_WITH_HELP = [...ALL_TOOLS, HELP_TOOL];

  it('1. "إزاي" help phrasing routes exclusively to search_help_topics, not the treasury data tool', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'إزاي أعمل إغلاق اليومية؟'));
    expect(result).toEqual(['search_help_topics']);
    expect(result).not.toContain('get_treasury_summary');
  });

  it('2. "ازاي" (bare-alef spelling variant) is also recognized as help intent', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'ازاي اعمل اغلاق اليومية؟'));
    expect(result).toEqual(['search_help_topics']);
  });

  it('3. "بيمشي إزاي؟" workflow question routes to help, not get_production_status/get_work_order', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'أمر الشغل بيمشي إزاي؟'));
    expect(result).toEqual(['search_help_topics']);
    expect(result).not.toContain('get_production_status');
    expect(result).not.toContain('get_work_order');
  });

  it('4. "فين أقدر أشوف الخزينة؟" navigation question routes to help, not treasury, despite "الخزينة" matching the TREASURY keyword rule', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'فين أقدر أشوف الخزينة؟'));
    expect(result).toEqual(['search_help_topics']);
    expect(result).not.toContain('get_treasury_summary');
  });

  it('5. "يعني إيه أمر شغل؟" conceptual question routes to help, not work-order data tools', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'يعني إيه أمر شغل؟'));
    expect(result).toEqual(['search_help_topics']);
    expect(result).not.toContain('get_work_order');
  });

  it('6. a plain treasury data question still routes to the business data tool, unaffected by the help lane', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'رصيد الخزينة كام؟'));
    expect(result).toEqual(['get_treasury_summary']);
    expect(result).not.toContain('search_help_topics');
  });

  it('7. a plain work-order data question still routes to production/work-order business tools, unaffected', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'هاتلي تفاصيل أمر الشغل رقم ١٢٣'));
    expect(result).toEqual(expect.arrayContaining(['get_work_order', 'search_production_by_customer', 'get_production_status']));
    expect(result).not.toContain('search_help_topics');
  });

  it('8. an ambiguous query (no help signal, no domain keyword) preserves the existing full-fallback behavior', () => {
    const result = selectToolsForRequest(TOOLS_WITH_HELP, auth({ roleNames: ['SUPER_ADMIN'] }), 'ساعدني');
    expect(result).toHaveLength(TOOLS_WITH_HELP.length);
  });

  it('9. help routing still goes through the permission pre-filter — search_help_topics is offered because it genuinely requires no permission, not because the guard was skipped', () => {
    const restricted = auth({ permissions: [] });
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, restricted, 'إزاي أعمل إغلاق اليومية؟'));
    expect(result).toEqual(['search_help_topics']);
  });

  it('10. search_help_topics is the tool selected for a help-intent query', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'إزاي أستخدم النظام؟'));
    expect(result).toContain('search_help_topics');
  });

  it('a business-domain word alone (no help phrasing) never triggers the help lane', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'رصيد الخزينة كام؟'));
    expect(result).not.toContain('search_help_topics');
  });

  it('defensive: if search_help_topics is absent from the registry, a help-phrased message falls back to normal routing instead of narrowing to nothing', () => {
    // SUPER_ADMIN so all 23 tools (including the requiresSuperAdmin one)
    // are genuinely allowed — isolates this fallback behavior from the
    // separate permission-pre-filter concern, same convention as the
    // pre-existing "ambiguous / fallback" tests above.
    const result = selectToolsForRequest(ALL_TOOLS, auth({ roleNames: ['SUPER_ADMIN'] }), 'إزاي أعمل إغلاق اليومية؟');
    // "إغلاق اليومية" matches no existing KEYWORD_RULES entry either, so
    // this exercises the full fallback path, same as any other message
    // with zero domain signal.
    expect(result).toHaveLength(ALL_TOOLS.length);
  });
});

/**
 * Task 15.4 — Task 15.3's audit found six natural-language help questions
 * that either fell through to business-data routing or got no narrowing
 * at all, purely because no HELP pattern recognized their phrasing. Each
 * new pattern is a hand-curated whitelist or a question-word PAIRED with a
 * specific qualifying word — never a bare question word — precisely
 * because Task 15.3 found bare `فين`/`إمتى`/`مين`/`هل`/`إيه` each has a
 * real business-data collision (see the negative tests below, especially
 * "إيه حالة الماكينات؟", the exact case that proves why).
 */
describe('selectToolsForRequest — Task 15.4 additional safe help patterns', () => {
  const HELP_TOOL = fakeTool('search_help_topics', null);
  const TOOLS_WITH_HELP = [...ALL_TOOLS, HELP_TOOL];

  it('1. "فين الخزينة؟" (bare module name, no أقدر/ألاقي) routes to HELP only', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'فين الخزينة؟'));
    expect(result).toEqual(['search_help_topics']);
  });

  it('2. "أمر الشغل بيتعمل إمتى؟" routes to HELP, not WORK_ORDERS/PRODUCTION data tools', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'أمر الشغل بيتعمل إمتى؟'));
    expect(result).toEqual(['search_help_topics']);
    expect(result).not.toContain('get_production_status');
  });

  it('3. "العميل بيتحدد إزاي؟" routes to HELP', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'العميل بيتحدد إزاي؟'));
    expect(result).toEqual(['search_help_topics']);
  });

  it('4. "مين يقدر يعيد فتح اليوم؟" routes to HELP via the "مين يقدر" capability-question pattern', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'مين يقدر يعيد فتح اليوم؟'));
    expect(result).toEqual(['search_help_topics']);
  });

  it('5. "هل التصميم إجباري؟" routes to HELP via the "هل ... إجباري/اختياري/لازم" pattern', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'هل التصميم إجباري؟'));
    expect(result).toEqual(['search_help_topics']);
  });

  it('6. "المخزون بيتابع إزاي؟" routes to HELP (already worked via bare إزاي, unaffected by this task)', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'المخزون بيتابع إزاي؟'));
    expect(result).toEqual(['search_help_topics']);
  });

  it('negative: "رصيد الخزينة كام؟" still routes to TREASURY, not HELP', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'رصيد الخزينة كام؟'));
    expect(result).toEqual(['get_treasury_summary']);
  });

  it('negative: "وريني أوامر الشغل المفتوحة" still routes to WORK_ORDERS/PRODUCTION, not HELP', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'وريني أوامر الشغل المفتوحة'));
    expect(result).toEqual(expect.arrayContaining(['get_work_order', 'get_production_status', 'search_production_by_customer']));
    expect(result).not.toContain('search_help_topics');
  });

  it('negative: "عندي كام عميل؟" still routes to CUSTOMERS, not HELP', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'عندي كام عميل؟'));
    expect(result).toEqual(expect.arrayContaining(['search_customers', 'get_customer']));
    expect(result).not.toContain('search_help_topics');
  });

  it('negative: "هات تفاصيل العميل أحمد" still routes to CUSTOMERS, not HELP', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'هات تفاصيل العميل أحمد'));
    expect(result).toEqual(expect.arrayContaining(['search_customers', 'get_customer']));
    expect(result).not.toContain('search_help_topics');
  });

  it('negative: "المورد كمال سعد" still routes to SUPPLIERS, not HELP', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'المورد كمال سعد'));
    expect(result).toEqual(expect.arrayContaining(['search_suppliers', 'get_supplier_statement']));
    expect(result).not.toContain('search_help_topics');
  });

  it('negative (most important): "إيه حالة الماكينات؟" must NOT enter the HELP-exclusive lane', () => {
    const result = names(selectToolsForRequest(TOOLS_WITH_HELP, auth(), 'إيه حالة الماكينات؟'));
    expect(result).toEqual(['get_machine_status']);
    expect(result).not.toContain('search_help_topics');
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
