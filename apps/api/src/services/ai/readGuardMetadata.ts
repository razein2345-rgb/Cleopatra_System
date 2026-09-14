/**
 * Task 12 — Guard A metadata: an explicit, hand-curated allowlist of
 * READ-ONLY get_* detail tools that have a natural paired search_* tool
 * and a UUID-shaped id field. Deliberately NOT derived from tool names or
 * any other inference — a tool is only ever added here as a reviewed,
 * explicit opt-in, exactly like `AI_TOOLS`'s own registry convention
 * (`tools/index.ts`'s own doc comment: "only ever appended ... after its
 * own specific approval — never speculatively").
 *
 * A future WRITE tool must never appear here without a deliberate, separate
 * decision — this file grants no behavior by itself, it only labels a
 * relationship the guard in `aiAgentService.ts` reads before ever calling
 * `dispatchTool()`. A tool with no entry here is completely unaffected by
 * Guard A — today's exact existing behavior is preserved by default.
 *
 * Permission note: each pair below shares the same `requiredPermission` as
 * its get_* detail tool, EXCEPT `get_customer_balance` (`orders.view`)
 * paired with `search_customers` (`partners.view`) — this is intentional
 * and safe, not an oversight: the substituted `search_customers` call still
 * goes through its own full `dispatchTool()` permission check, so a caller
 * without `partners.view` simply gets a permission-denied result instead of
 * a dead-end invalid-UUID result. Either way nothing executes without its
 * own independent permission check passing.
 */
export interface ReadGuardEntry {
  /** The input field on the get_* detail tool that holds the entity's UUID. */
  idField: string;
  /** The tool name to call instead when that field is not a valid UUID. */
  pairedSearchTool: string;
}

export const READ_GUARD_ENTITY_TOOLS: Readonly<Record<string, ReadGuardEntry>> = {
  get_customer: { idField: 'id', pairedSearchTool: 'search_customers' },
  get_customer_balance: { idField: 'partnerId', pairedSearchTool: 'search_customers' },
  get_quotation: { idField: 'id', pairedSearchTool: 'search_quotations' },
  get_supplier_statement: { idField: 'partnerId', pairedSearchTool: 'search_suppliers' },
};
