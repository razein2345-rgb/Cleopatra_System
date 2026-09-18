import { hasPermission } from '@cleopatra/shared';
import type { AiConversationContext, AiEntityType } from '@cleopatra/shared';
import type { AuthenticatedUser } from '../authContext.js';
import type { AnyAiToolDefinition } from './toolTypes.js';

/**
 * Task 8.6 — Dynamic AI Tool Selection V1 (owner-approved architecture,
 * 2026-09-13). Deterministic only — no LLM call, no embeddings, no new
 * dependency. Goal: reduce how many of the 23 registered `AI_TOOLS`
 * definitions are sent to qwen3 on a given request (Task 8.5 measured
 * system prompt + all 23 tools at ~3521/4096 runtime-context tokens,
 * leaving very little room for conversation), without touching any tool's
 * own implementation, permission, or description.
 *
 * Routing narrows what the model is *offered*, never what it is
 * *authorized to do* — `dispatchTool()` in `aiAgentService.ts` is
 * completely unmodified and remains the sole authority for whether a call
 * actually executes. See `isToolAllowedFor`'s own doc comment for why its
 * logic is a deliberate, explicitly-flagged duplicate of `dispatchTool`'s
 * two checks rather than a shared extraction.
 */

export type ToolDomain =
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'ORDERS'
  | 'WORK_ORDERS'
  | 'QUOTATIONS'
  | 'PRODUCTION'
  | 'INVENTORY'
  | 'TREASURY'
  | 'MACHINES'
  | 'EMPLOYEES'
  | 'LEADS'
  | 'PRICING'
  | 'DASHBOARD'
  | 'CALL_LOGS'
  | 'HELP';

/**
 * One entry per registered tool name (`AI_TOOLS`'s own names, not
 * invented). Some tools deliberately list more than one domain — never
 * forced into artificial exclusivity:
 * - `get_reorder_due` — about a customer's *future order*, so CUSTOMERS
 *   and ORDERS both apply.
 * - `search_production_by_customer` / `get_production_status` — both
 *   listed under WORK_ORDERS and PRODUCTION in the approved classification
 *   (they answer "which stage is this job at", which is both concepts at
 *   once in this system).
 * - `get_purchase_requests_due` — an inventory shortfall that becomes a
 *   supplier purchase, so SUPPLIERS and INVENTORY both apply.
 *
 * A tool name with NO entry here is never silently excluded by domain
 * filtering (see `toolMatchesDomains`) — classification is opt-in for
 * *narrowing*, not opt-out for inclusion, so a future tool nobody
 * remembered to classify still reaches the model exactly as it does today.
 */
const TOOL_DOMAINS: Partial<Record<string, ToolDomain[]>> = {
  search_customers: ['CUSTOMERS'],
  get_customer: ['CUSTOMERS'],
  get_customer_balance: ['CUSTOMERS'],
  get_reorder_due: ['CUSTOMERS', 'ORDERS'],
  search_suppliers: ['SUPPLIERS'],
  get_supplier_statement: ['SUPPLIERS'],
  get_purchase_requests_due: ['SUPPLIERS', 'INVENTORY'],
  search_orders: ['ORDERS'],
  get_order: ['ORDERS'],
  get_work_order: ['WORK_ORDERS'],
  search_production_by_customer: ['WORK_ORDERS', 'PRODUCTION'],
  get_production_status: ['WORK_ORDERS', 'PRODUCTION'],
  search_quotations: ['QUOTATIONS'],
  get_quotation: ['QUOTATIONS'],
  search_inventory: ['INVENTORY'],
  get_inventory_item: ['INVENTORY'],
  get_treasury_summary: ['TREASURY'],
  get_machine_status: ['MACHINES'],
  get_employee_payroll: ['EMPLOYEES'],
  search_leads: ['LEADS'],
  calculate_price: ['PRICING'],
  get_dashboard_summary: ['DASHBOARD'],
  search_call_logs: ['CALL_LOGS'],
  search_help_topics: ['HELP'],
};

/**
 * Small, explicit, high-confidence Egyptian-Arabic term list (owner's own
 * Step 6 examples) — deliberately NOT an exhaustive NLP engine. No `\b`
 * word-boundary anchors: JS regex word boundaries are computed against
 * ASCII `\w`, so they silently never match around Arabic text (a real bug
 * class already hit once in this project — searchSuppliers.ts's own
 * "Gap 2a" comment) — plain substring matching is used instead throughout,
 * including for the few Latin terms, for the same reason kept consistent.
 *
 * Multiple rules may match the same message on purpose (Step 7) — e.g. a
 * message naming both a customer and a supplier activates both domains
 * rather than arbitrarily picking one.
 */
const KEYWORD_RULES: { domains: ToolDomain[]; pattern: RegExp }[] = [
  { domains: ['CUSTOMERS'], pattern: /عميل|العميل|عميلة|زبون|الزبون/ },
  { domains: ['SUPPLIERS'], pattern: /مورّد|المورّد|مورد|المورد/ },
  { domains: ['QUOTATIONS'], pattern: /عرض\s*(ال)?سعر|عرض\s*(ال)?أسعار|quotation/i },
  // Broadened past the owner's literal 4 examples to also catch "أمر
  // الشغل"/"امر الشغل" (definite-article-in-the-middle) — this exact
  // phrasing is the one the owner themselves used repeatedly earlier in
  // this very project's own POS conversation ("تفاصيل أمر الشغل"), so
  // excluding it would miss the single most realistic real-world case.
  { domains: ['WORK_ORDERS'], pattern: /أمر\s*(ال)?شغل|امر\s*(ال)?شغل|أمر\s*(ال)?تشغيل|امر\s*(ال)?تشغيل/ },
  { domains: ['ORDERS'], pattern: /طلب|الطلب|فاتورة|الفاتورة/ },
  { domains: ['PRODUCTION'], pattern: /إنتاج|الإنتاج|انتاج|تشغيل/ },
  { domains: ['INVENTORY'], pattern: /مخزون|المخزون|صنف|الأصناف|مخزن/ },
  { domains: ['TREASURY'], pattern: /خزينة|الخزينة|نقدية|النقدية|رصيد الخزينة/ },
  { domains: ['MACHINES'], pattern: /ماكينة|الماكينة|ماكينات/ },
  { domains: ['EMPLOYEES'], pattern: /موظف|الموظف|مرتبات|المرتبات|مرتب/ },
  { domains: ['LEADS'], pattern: /ليد|ليدز|lead/i },
  { domains: ['PRICING'], pattern: /سعر|التسعير|تكلفة|احسبلي|احسب/ },
  { domains: ['DASHBOARD'], pattern: /داشبورد|dashboard|ملخص عام/i },
  { domains: ['CALL_LOGS'], pattern: /مكالمات|المكالمات|اتصالات|سجل المكالمات/ },
];

/**
 * Task 14.2 — dedicated system-help intent detection. Deterministic only
 * (no LLM call, no embeddings, same constraint as the rest of this file),
 * and deliberately made of INTENT phrasing only — asking HOW the system
 * works, WHERE to find something, or WHAT a concept means — never a
 * business-domain word. Task 14's own audit found a plain domain-keyword
 * match (e.g. "أمر الشغل" → WORK_ORDERS) was routing a conceptual question
 * like "أمر الشغل بيمشي إزاي؟" straight to a live-data tool
 * (`get_production_status`) instead of the new `search_help_topics` tool
 * (Task 14.1) — this list exists specifically to catch that phrasing
 * pattern before domain-keyword routing ever runs. No `\b` word-boundary
 * anchors, same reasoning as `KEYWORD_RULES` above (they silently never
 * match Arabic text).
 */
const HELP_INTENT_PATTERNS: RegExp[] = [
  /إزاي|ازاي/,
  /كيف|كيفية/,
  /طريقة/,
  /خطوات/,
  /فين\s*(أقدر|اقدر|ألاقي|الاقي)/,
  /مكان/,
  /يعني\s*(إيه|ايه)/,
  /(ما|إيه|ايه)\s*هو/,
  /شرح|شرحلي|اشرحلي/,
  /استخدام|أستخدم|استخدم/,
  // Task 15.4 — Task 15.3's audit found each of these four gaps live and
  // explicitly warned against bare `فين`/`إمتى`/`مين`/`هل` (each has a real
  // business-data collision — e.g. bare `إيه`/`هل` would wrongly capture
  // "إيه حالة الماكينات؟", a live-verified business query). Every pattern
  // below is a hand-curated, explicit whitelist or a question-word PAIRED
  // with a specific qualifying word — never the question word alone.
  //
  // "فين + <specific screen/module name>" — an explicit enumerated list
  // (the exact same screens NAVIGATION_MAP already answers with), not a
  // generic noun match, so "فين الفاتورة بتاعت العميل أحمد؟" (a real
  // business lookup naming a business entity, not a screen) never matches.
  /فين\s*(الخزينة|المخزون|الموردين|العملاء|التقارير|لوحة الإنتاج|عروض الأسعار|الطلبات|الماكينات)/,
  // "<creation/start verb> + إمتى" — إمتى AFTER a narrow, specific set of
  // procedural verbs, matching the owner's own example word order
  // ("أمر الشغل بيتعمل إمتى؟"). A business question like "الطلب هيتسلم
  // إمتى؟" uses a different verb (هيتسلم) and never matches.
  /(بيتعمل|بيتنشئ|بيتنشأ|بيبدأ|بيحصل)\s*إمتى/,
  // "مين + يقدر/المسؤول" — a capability/permission question shape ("who is
  // ABLE to ...", "who is RESPONSIBLE for ..."), distinct from an audit-
  // style business question like "مين اللي عمل الطلب ده؟", which never
  // contains "يقدر" or "المسؤول" right after "مين".
  /مين\s*(يقدر|المسؤول)/,
  // "هل ... إجباري/اختياري/لازم" — bounded gap (≤20 chars, same spirit as
  // `correctionDetection.ts`'s own bounded gap) so this only fires for a
  // genuine mandatory/optional question, never a generic "هل" business
  // question like "هل الفاتورة اتدفعت؟" (no إجباري/اختياري/لازم present).
  /هل\s*[\s\S]{0,20}(إجباري|اختياري|لازم)/,
];

function isHelpIntent(message: string): boolean {
  return HELP_INTENT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Stricter than `toolMatchesDomains` below on purpose: that function
 * treats an unclassified tool as "matches everything" — the right default
 * when merely NARROWING a broad menu (an unlisted future tool should
 * never be silently hidden). The help lane is the opposite case: it must
 * be an EXCLUSIVE, small menu (Task 14.2's own examples — a business tool
 * like `get_treasury_summary` must never appear alongside the help tool),
 * so an unclassified tool here must be excluded, not included.
 */
function toolMatchesDomainsExclusively(tool: AnyAiToolDefinition, domainSet: Set<ToolDomain>): boolean {
  const toolDomains = TOOL_DOMAINS[tool.name];
  if (!toolDomains) return false;
  return toolDomains.some((domain) => domainSet.has(domain));
}

/** Step 8 — the exact mapping the owner specified. `WORK_ORDER` maps to both WORK_ORDERS and PRODUCTION, same as the tools' own classification above. */
const CONTEXT_ENTITY_TO_DOMAINS: Record<AiEntityType, ToolDomain[]> = {
  CUSTOMER: ['CUSTOMERS'],
  SUPPLIER: ['SUPPLIERS'],
  WORK_ORDER: ['WORK_ORDERS', 'PRODUCTION'],
  QUOTATION: ['QUOTATIONS'],
};

/**
 * Boolean-only mirror of `dispatchTool`'s two authorization checks
 * (`aiAgentService.ts`). This is a DELIBERATE duplication, not an
 * oversight: Task 8.6's own rules forbid modifying `dispatchTool` at all
 * ("intentional defense-in-depth"), so there is no way to have this
 * pre-filter literally share code with it without touching that function.
 * If `dispatchTool`'s two conditions ever change, this must be updated to
 * match — both places are cross-referenced in their own comments for
 * exactly this reason. This function only narrows what is *offered* to
 * the model; it grants nothing — `dispatchTool` re-checks the identical
 * condition independently before any `execute()` ever runs, regardless of
 * whether this function is correct, buggy, or bypassed entirely.
 */
export function isToolAllowedFor(tool: AnyAiToolDefinition, auth: AuthenticatedUser): boolean {
  if (tool.requiresSuperAdmin && !auth.roleNames.includes('SUPER_ADMIN')) return false;
  if (tool.requiredPermission && !hasPermission(auth.permissions, tool.requiredPermission)) return false;
  return true;
}

function matchKeywordDomains(message: string): ToolDomain[] {
  const domains = new Set<ToolDomain>();
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(message)) {
      for (const domain of rule.domains) domains.add(domain);
    }
  }
  return [...domains];
}

function toolMatchesDomains(tool: AnyAiToolDefinition, domainSet: Set<ToolDomain>): boolean {
  const toolDomains = TOOL_DOMAINS[tool.name];
  if (!toolDomains || toolDomains.length === 0) return true; // unclassified → never silently excluded
  return toolDomains.some((domain) => domainSet.has(domain));
}

/**
 * The V1 routing decision. Always returns a subset of `tools` the caller
 * is actually permitted to use — never more.
 *
 * Precedence (Task 14.2, highest tier): a clear system-help question
 * ("إزاي"/"فين أقدر"/"يعني إيه"/...) wins over EVERYTHING below, including
 * an explicit domain keyword in the same message — "فين أقدر أشوف
 * الخزينة؟" must expose only `search_help_topics`, never
 * `get_treasury_summary`, even though "الخزينة" matches the TREASURY
 * keyword rule. This only fires when the exclusive help-only selection is
 * actually non-empty (i.e. `search_help_topics` is in `allowedTools`) —
 * otherwise it falls through to the exact same domain/context/fallback
 * chain as any other message, never narrowing to nothing.
 *
 * Precedence (Step 9 "Topic Change"): an explicit domain keyword in the
 * CURRENT message always wins over `context`, never merges with it — a
 * fresh "هاتلي المورد كمال" after a CUSTOMER context routes to SUPPLIERS
 * only, not CUSTOMERS+SUPPLIERS, matching the owner's own example exactly.
 * `context` only ever fills in when the current message has zero
 * high-confidence keyword of its own (Step 10, a pure follow-up like "طب
 * تفاصيله؟").
 *
 * `latestUserMessage` must be the RAW text of the newest turn — never the
 * context-note-augmented prompt text `injectContextNote` builds elsewhere,
 * which literally contains words like "عميل"/"مورد"/"أمر شغل" for
 * whichever entity was last discussed. Matching keywords against that
 * augmented text would make every follow-up turn falsely "re-detect" the
 * OLD entity's own domain as if the user had just typed it, defeating the
 * topic-change rule above on every single follow-up. `runAiChat` computes
 * this from `turns` (never mutated) before it ever builds/mutates the
 * `messages` array, specifically to avoid that.
 *
 * Fallback (Steps 11 & 13) — any of: no keyword and no context, an
 * unrecognized/missing context entity type, a domain that matched zero
 * currently-allowed tools, or an unexpected error while routing — all
 * resolve to the full `allowedTools` set (never the raw, permission-
 * unfiltered `tools` input), so an uncertain or broken routing decision
 * can only ever fall back to today's exact behavior, scoped to what this
 * user could already do.
 */
export function selectToolsForRequest(
  tools: AnyAiToolDefinition[],
  auth: AuthenticatedUser,
  latestUserMessage: string,
  context?: AiConversationContext,
): AnyAiToolDefinition[] {
  const allowedTools = tools.filter((tool) => isToolAllowedFor(tool, auth));

  try {
    if (isHelpIntent(latestUserMessage)) {
      const helpTools = allowedTools.filter((tool) => toolMatchesDomainsExclusively(tool, new Set<ToolDomain>(['HELP'])));
      if (helpTools.length > 0) return helpTools;
    }

    const keywordDomains = matchKeywordDomains(latestUserMessage);
    const contextDomains = context ? (CONTEXT_ENTITY_TO_DOMAINS[context.entityType] ?? []) : [];
    const domains = keywordDomains.length > 0 ? keywordDomains : contextDomains;

    if (domains.length === 0) return allowedTools;

    const domainSet = new Set(domains);
    const selected = allowedTools.filter((tool) => toolMatchesDomains(tool, domainSet));
    return selected.length > 0 ? selected : allowedTools;
  } catch {
    // Step 13 — a routing error must never reduce availability below what
    // permissions alone already allow, and must never fall back further
    // than that to the unfiltered registry.
    return allowedTools;
  }
}
