import { z } from 'zod';
import { listSuppliers } from '../../supplierLedgerService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Phase 2 Task 4 (owner-approved, 2026-09-10, Option B). Wraps
 * `supplierLedgerService.ts::listSuppliers()` unmodified — it already
 * computes each supplier's real balance (sum of purchases minus sum of
 * payments); this tool only adds an in-memory name filter, same pattern
 * as `search_customers`/`search_orders`/`search_quotations`. No branch
 * filter exists in the real `listSuppliers()` (same as
 * `listBusinessPartners`/`listQuotations`) — this tool matches that
 * exactly rather than inventing a stricter scope.
 *
 * Gap 2a fix (Task 7 Root-Cause Discovery, 2026-09-10): a natural question
 * like "المورد كمال سعد" prepends a generic role word the stored name never
 * contains, so the one-directional `nameAr.includes(query)` check (the
 * stored name must contain the WHOLE query) can never match even though
 * "كمال سعد" is the real, correct supplier name. No text-normalization or
 * fuzzy-matching helper exists anywhere in this project — `search_customers`
 * and every other `search_*` tool use this exact same unextended
 * one-directional substring check — so this stays a local, narrow fix
 * rather than inventing shared fuzzy-search infrastructure. It strips only
 * a small fixed set of LEADING role words ("المورد"/"مورد" followed by a
 * space) before retrying the match — never mid-string removal, never a
 * similarity/edit-distance threshold. The original raw-query match still
 * runs first and alone decides a match on its own, so a supplier whose
 * real name genuinely starts with "مورد" is unaffected; stripping only
 * ever produces a non-empty fallback string, so "المورد" alone (with
 * nothing after it) can never degrade into matching every supplier.
 */
const SUPPLIER_QUERY_LEADING_ROLE_WORD = /^(?:المورد|مورد)\s+/;

function stripLeadingSupplierRoleWord(query: string): string {
  let stripped = query;
  let previous: string;
  do {
    previous = stripped;
    stripped = stripped.replace(SUPPLIER_QUERY_LEADING_ROLE_WORD, '').trim();
  } while (stripped !== previous);
  return stripped;
}

const inputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional().describe('Free-text match on supplier name'),
});

export const searchSuppliersTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_suppliers',
  description: 'Search suppliers by name. Returns each supplier\'s current balance (what we owe them) — call get_supplier_statement for one supplier\'s full purchase/payment history.',
  requiredPermission: 'suppliers.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Free-text match on supplier name' } },
    additionalProperties: false,
  },
  async execute(input) {
    const suppliers = await listSuppliers();
    const rawQuery = input.query?.toLowerCase().trim();
    if (!rawQuery) return suppliers.slice(0, 20);

    const normalizedQuery = stripLeadingSupplierRoleWord(rawQuery);
    const filtered = suppliers.filter((s) => {
      const name = s.nameAr.toLowerCase();
      if (name.includes(rawQuery)) return true;
      return normalizedQuery.length > 0 && normalizedQuery !== rawQuery && name.includes(normalizedQuery);
    });
    return filtered.slice(0, 20);
  },
};
