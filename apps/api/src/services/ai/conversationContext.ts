import { aiConversationContextSchema } from '@cleopatra/shared';
import type { AiConversationContext } from '@cleopatra/shared';

/**
 * Task 8 (2026-09-12) — Structured Conversation Context V1
 * (docs/AI — Task 8 implementation plan, owner-approved).
 *
 * Deterministic, tool-specific extraction ONLY — no generic JSON scanning,
 * no LLM-generated memory, no "first id we find" guessing. A tool call not
 * listed in `EXTRACTORS` below simply never touches the conversation
 * context (a safe default, not a gap) — see `AI_TOOLS`'s own hand-listed
 * registry for the same "explicit, never auto-discovered" convention this
 * follows.
 *
 * V1 deliberately carries exactly ONE entity, never a list/stack — enough
 * to resolve "ده"/"دي"/"تفاصيله" against the single thing just discussed,
 * but NOT enough to resolve an ordinal reference into a list ("العرض
 * التاني") — that's a disclosed, deferred V2 concern (Task 8 plan §1),
 * not something this file attempts.
 *
 * Two extractors below (`search_suppliers`, `get_supplier_statement`)
 * intentionally deviate from the field names named in the approved plan's
 * literal example text, because the real return shapes
 * (supplierLedgerService.ts) turned out to differ from what the plan
 * assumed — each deviation is called out in its own extractor's comment,
 * per the plan's own instruction for exactly this situation ("لو structure
 * مختلفة عن المتوقع، لا تخمّن — استخدم الفعلية").
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** `get_work_order` — single record by construction (`{found, workOrder}`). */
function extractFromGetWorkOrder(parsed: unknown): AiConversationContext | null {
  if (!isRecord(parsed) || parsed.found !== true || !isRecord(parsed.workOrder)) return null;
  const entityId = asNonEmptyString(parsed.workOrder.id);
  const label = asNonEmptyString(parsed.workOrder.workOrderNumber);
  if (!entityId || !label) return null;
  return { entityType: 'WORK_ORDER', entityId, label };
}

/** `get_quotation` — single record by construction (`{found, quotation}`). */
function extractFromGetQuotation(parsed: unknown): AiConversationContext | null {
  if (!isRecord(parsed) || parsed.found !== true || !isRecord(parsed.quotation)) return null;
  const entityId = asNonEmptyString(parsed.quotation.id);
  const label = asNonEmptyString(parsed.quotation.quotationNumber);
  if (!entityId || !label) return null;
  return { entityType: 'QUOTATION', entityId, label };
}

/** `get_customer` — single record by construction (`{found, partner}`). */
function extractFromGetCustomer(parsed: unknown): AiConversationContext | null {
  if (!isRecord(parsed) || parsed.found !== true || !isRecord(parsed.partner)) return null;
  const entityId = asNonEmptyString(parsed.partner.id);
  const label = asNonEmptyString(parsed.partner.nameAr);
  if (!entityId || !label) return null;
  return { entityType: 'CUSTOMER', entityId, label };
}

/**
 * `get_supplier_statement` — single record (`{found, statement}`).
 *
 * Deviation from the plan's literal example (`statement.partner.id` /
 * `statement.partner.nameAr`): the real `getSupplierStatement()` return
 * shape (supplierLedgerService.ts:174) is flat —
 * `{partnerId, nameAr, openingBalance, entries, closingBalance}`, no
 * nested `partner` object. Using the real fields here.
 */
function extractFromGetSupplierStatement(parsed: unknown): AiConversationContext | null {
  if (!isRecord(parsed) || parsed.found !== true || !isRecord(parsed.statement)) return null;
  const entityId = asNonEmptyString(parsed.statement.partnerId);
  const label = asNonEmptyString(parsed.statement.nameAr);
  if (!entityId || !label) return null;
  return { entityType: 'SUPPLIER', entityId, label };
}

/** `search_production_by_customer` — array; only breadcrumb-worthy when exactly one match. */
function extractFromSearchProductionByCustomer(parsed: unknown): AiConversationContext | null {
  if (!Array.isArray(parsed) || parsed.length !== 1) return null;
  const item = parsed[0];
  if (!isRecord(item)) return null;
  const entityId = asNonEmptyString(item.workOrderId);
  const workOrderNumber = asNonEmptyString(item.workOrderNumber);
  if (!entityId || !workOrderNumber) return null;
  // `customerName` is nullable on this tool's own DTO (optional-chained in
  // searchProductionByCustomer.ts) — fall back to the work order number
  // alone rather than producing a label like "null — WO-2026-00123".
  const customerName = asNonEmptyString(item.customerName);
  const label = customerName ? `${customerName} — ${workOrderNumber}` : workOrderNumber;
  return { entityType: 'WORK_ORDER', entityId, label };
}

/** `search_quotations` — array; only breadcrumb-worthy when exactly one match. */
function extractFromSearchQuotations(parsed: unknown): AiConversationContext | null {
  if (!Array.isArray(parsed) || parsed.length !== 1) return null;
  const item = parsed[0];
  if (!isRecord(item)) return null;
  const entityId = asNonEmptyString(item.id);
  const label = asNonEmptyString(item.quotationNumber);
  if (!entityId || !label) return null;
  return { entityType: 'QUOTATION', entityId, label };
}

/** `search_customers` — array; only breadcrumb-worthy when exactly one match. */
function extractFromSearchCustomers(parsed: unknown): AiConversationContext | null {
  if (!Array.isArray(parsed) || parsed.length !== 1) return null;
  const item = parsed[0];
  if (!isRecord(item)) return null;
  const entityId = asNonEmptyString(item.id);
  const label = asNonEmptyString(item.nameAr);
  if (!entityId || !label) return null;
  return { entityType: 'CUSTOMER', entityId, label };
}

/**
 * `search_suppliers` — array; only breadcrumb-worthy when exactly one match.
 *
 * Deviation from the plan's literal example (`result.id`): the real
 * `SupplierSummary` shape (supplierLedgerService.ts's `listSuppliers`,
 * returned by this tool unmodified) has no `id` field at all — the
 * partner's id is `partnerId`. Using the real field here.
 */
function extractFromSearchSuppliers(parsed: unknown): AiConversationContext | null {
  if (!Array.isArray(parsed) || parsed.length !== 1) return null;
  const item = parsed[0];
  if (!isRecord(item)) return null;
  const entityId = asNonEmptyString(item.partnerId);
  const label = asNonEmptyString(item.nameAr);
  if (!entityId || !label) return null;
  return { entityType: 'SUPPLIER', entityId, label };
}

/**
 * `get_machine_status` is deliberately NOT in this table — excluded from
 * V1 per the approved plan (no singular "get one machine" tool, and the
 * underlying "امتى آخر صيانة؟" question has no answer in the schema
 * regardless of any memory fix — a data gap, not something this file can
 * or should paper over).
 */
const EXTRACTORS: Record<string, (parsed: unknown) => AiConversationContext | null> = {
  get_work_order: extractFromGetWorkOrder,
  get_quotation: extractFromGetQuotation,
  get_customer: extractFromGetCustomer,
  get_supplier_statement: extractFromGetSupplierStatement,
  search_production_by_customer: extractFromSearchProductionByCustomer,
  search_quotations: extractFromSearchQuotations,
  search_customers: extractFromSearchCustomers,
  search_suppliers: extractFromSearchSuppliers,
};

/**
 * `rawContent` is the same JSON-stringified string `dispatchTool` already
 * produces as a tool_result's `content` (aiAgentService.ts) — this function
 * owns its own parsing so callers never need to know that detail. Returns
 * `null` for: an unlisted tool, unparseable content, a shape that doesn't
 * match the expected DTO, or a search result set that isn't exactly one
 * match. The final `safeParse` against the shared schema is a defensive
 * backstop — it should always pass given the checks above, but guarantees
 * this function can never hand back a malformed context even if a DTO
 * shape changes out from under it later.
 */
export function extractConversationContext(toolName: string, rawContent: string): AiConversationContext | null {
  const extractor = EXTRACTORS[toolName];
  if (!extractor) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return null;
  }

  const candidate = extractor(parsed);
  if (!candidate) return null;

  const result = aiConversationContextSchema.safeParse(candidate);
  return result.success ? result.data : null;
}
