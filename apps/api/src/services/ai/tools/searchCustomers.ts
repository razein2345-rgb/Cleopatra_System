import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import { mapPartnerToDto } from '../../businessPartnerService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Contradiction found during Phase 1 "Before Coding" verification
 * (owner-approved resolution): `businessPartnerService.ts` has no list/
 * search function of its own — that query lives inline in
 * `controllers/businessPartners.ts::listBusinessPartners`. This tool
 * reuses that exact same Prisma query + `mapPartnerToDto`, unmodified,
 * plus a simple in-memory substring filter over name/phone/email (no
 * backend search endpoint exists to call instead) — no new business logic.
 */
const inputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
});

export const searchCustomersTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_customers',
  description: 'Search Cleopatra business partners (customers) by name, phone, or email. Returns a short list of matches — call get_customer for full details on one.',
  requiredPermission: 'partners.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Free-text match on name, phone, or email' } },
    additionalProperties: false,
  },
  async execute(input) {
    const partners = await prisma.businessPartner.findMany({
      where: { isDeleted: false },
      orderBy: { nameAr: 'asc' },
      include: { tags: { select: { tagId: true } } },
    });

    const dtos = partners.map((p) => mapPartnerToDto(p, p.tags.map((t) => t.tagId)));

    const q = input.query?.toLowerCase().trim();
    const filtered = q
      ? dtos.filter(
          (p) =>
            p.nameAr.toLowerCase().includes(q) ||
            (p.phone?.toLowerCase().includes(q) ?? false) ||
            (p.email?.toLowerCase().includes(q) ?? false),
        )
      : dtos;

    return filtered.slice(0, 20).map((p) => ({
      id: p.id,
      nameAr: p.nameAr,
      phone: p.phone,
      email: p.email,
      status: p.status,
      branchId: p.branchId,
    }));
  },
};
