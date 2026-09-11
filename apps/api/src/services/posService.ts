import type { BusinessPartner } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

/**
 * POS / Cashier module (2026-09-11, owner-approved) — "Walk-in customer".
 *
 * The owner's explicit decision: keep `WALK_IN_ALLOWED_KINDS`/
 * `assertPartnerPresentUnlessWalkIn` in `orderService.ts` completely
 * untouched (that Legacy Rule still only lets INVENTORY_RETAIL/MANUAL items
 * skip a partner). Instead, a quick POS sale with no real customer chosen
 * attaches one shared, real `BusinessPartner` row per branch — so a Service/
 * Product/Boards line (which the existing rule requires a partner for) can
 * still be sold "بيع مباشر" without the cashier picking a real customer or a
 * new Customer row being created on every single sale.
 *
 * `status` is left at its schema default (`PROSPECT`) rather than `ACTIVE`
 * — `createBusinessPartner`'s own rule (`hasValidContactMethod`) refuses an
 * ACTIVE partner with no phone/email on file, and this row deliberately has
 * neither. Nothing about that rule is touched; this just never claims a
 * status it can't satisfy.
 */
export const WALK_IN_PARTNER_NAME = 'عميل نقدي';

/**
 * Get-or-create, safe under concurrent first-time calls for the same
 * branch. No new unique constraint was approved for this (owner: "لا تضف
 * unique constraint جديد بدون موافقة"), so instead of relying on one, a
 * Postgres advisory lock scoped to the branch id serializes the
 * find-then-create race for the (extremely rare — this fires at most once
 * per branch, ever) window where two cashiers hit "بيع مباشر" for the very
 * first time at the same instant. The lock is released automatically when
 * the transaction ends.
 */
export async function getOrCreateWalkInPartner(branchId: string): Promise<BusinessPartner> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${branchId}))`;

    const existing = await tx.businessPartner.findFirst({
      where: { isDeleted: false, branchId, nameAr: WALK_IN_PARTNER_NAME },
    });
    if (existing) return existing;

    return tx.businessPartner.create({
      data: {
        nameAr: WALK_IN_PARTNER_NAME,
        isIndividual: true,
        roles: ['CUSTOMER'],
        branchId,
      },
    });
  });
}
