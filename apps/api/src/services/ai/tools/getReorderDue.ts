import { z } from 'zod';
import { buildItemGroups, isOverdue, isSoon, resolveEffectiveDate } from '@cleopatra/shared';
import { prisma } from '../../../lib/prisma.js';
import { mapOrderToDto, ORDER_INCLUDE } from '../../orderService.js';
import { mapPartnerToDto } from '../../businessPartnerService.js';
import { mapOverrideToDto } from '../../itemReorderOverrideService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Contradiction found during Phase 1 verification (owner-approved
 * resolution): the reorder-prediction functions this tool needs lived
 * only in `apps/web/src/lib/reorderPrediction.ts` — frontend-only code a
 * server-side tool cannot import. Relocated verbatim (same formulas, same
 * thresholds) to `packages/shared/src/reorder/reorderPrediction.ts`; the
 * three frontend call sites (`ReorderPredictionTab.tsx`,
 * `ReorderDueWidget.tsx`, `ReorderDuePage.tsx`) now import it from
 * `@cleopatra/shared` instead, so there is exactly one implementation, not
 * two. This tool otherwise reproduces `ReorderDuePage.tsx`'s own grouping
 * logic exactly — same three unfiltered fetches (all orders, all
 * overrides, all partners), same per-partner grouping.
 */
const inputSchema = z.object({
  partnerId: z.string().uuid().optional(),
  filter: z.enum(['ALL', 'OVERDUE', 'SOON']).optional().default('ALL'),
});

export const getReorderDueTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_reorder_due',
  description: 'List customers whose past order items are due or overdue for reordering, based on their own order history average gap (optionally scoped to one customer).',
  requiredPermission: 'orders.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: {
      partnerId: { type: 'string', format: 'uuid' },
      filter: { type: 'string', enum: ['ALL', 'OVERDUE', 'SOON'] },
    },
    additionalProperties: false,
  },
  async execute(input) {
    const [orders, overrideRows, partners] = await Promise.all([
      prisma.order.findMany({
        where: { isDeleted: false, ...(input.partnerId ? { partnerId: input.partnerId } : {}) },
        include: ORDER_INCLUDE,
        orderBy: { date: 'desc' },
      }),
      prisma.itemReorderOverride.findMany(),
      prisma.businessPartner.findMany({ where: { isDeleted: false }, include: { tags: { select: { tagId: true } } } }),
    ]);

    const orderDtos = orders.map((o) => mapOrderToDto(o, false));
    const overrides = overrideRows.map(mapOverrideToDto);
    const partnerDtos = partners.map((p) => mapPartnerToDto(p, p.tags.map((t) => t.tagId)));
    const partnerById = new Map(partnerDtos.map((p) => [p.id, p]));

    const ordersByPartner = new Map<string, typeof orderDtos>();
    for (const o of orderDtos) {
      if (!o.partnerId) continue;
      const list = ordersByPartner.get(o.partnerId) ?? [];
      list.push(o);
      ordersByPartner.set(o.partnerId, list);
    }

    const overridesByPartnerAndKey = new Map<string, Map<string, (typeof overrides)[number]>>();
    for (const ov of overrides) {
      const map = overridesByPartnerAndKey.get(ov.partnerId) ?? new Map();
      map.set(ov.itemKey, ov);
      overridesByPartnerAndKey.set(ov.partnerId, map);
    }

    const now = Date.now();
    const results: {
      partnerId: string;
      partnerName: string;
      items: { label: string; effectiveDate: string; overdue: boolean }[];
    }[] = [];

    for (const [partnerId, partnerOrders] of ordersByPartner) {
      const partner = partnerById.get(partnerId);
      if (!partner) continue;
      const itemGroups = buildItemGroups(partnerOrders);
      const partnerOverrides = overridesByPartnerAndKey.get(partnerId);
      const dueItems: { label: string; effectiveDate: string; overdue: boolean }[] = [];
      for (const g of itemGroups) {
        const effective = resolveEffectiveDate(g, partnerOverrides?.get(g.key));
        if (!effective) continue;
        const overdue = isOverdue(effective, now);
        const soon = isSoon(effective, now);
        if (!overdue && !soon) continue;
        if (input.filter === 'OVERDUE' && !overdue) continue;
        if (input.filter === 'SOON' && !(soon && !overdue)) continue;
        dueItems.push({ label: g.label, effectiveDate: effective.toISOString(), overdue });
      }
      if (dueItems.length === 0) continue;
      dueItems.sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime());
      results.push({ partnerId, partnerName: partner.nameAr, items: dueItems });
    }

    return results.slice(0, 30);
  },
};
