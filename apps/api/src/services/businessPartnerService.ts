import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { BusinessPartner } from '@cleopatra/shared';

type PartnerRecord = Prisma.BusinessPartnerGetPayload<object>;

/**
 * `tagIds` is a separate parameter rather than an implicit `include` inside
 * this mapper — Category is a plain column on `BusinessPartner` (no join
 * needed), but Tags live in the `BusinessPartnerTag` join table, and
 * whether that join is worth fetching varies by caller (the Directory
 * list doesn't render tags; the Partner Profile detail view does). See
 * 03_IMPLEMENT.md M4's query-performance note.
 */
export function mapPartnerToDto(partner: PartnerRecord, tagIds: string[]): BusinessPartner {
  return {
    id: partner.id,
    nameAr: partner.nameAr,
    nameEn: partner.nameEn,
    shortName: partner.shortName,
    isIndividual: partner.isIndividual,
    gender: partner.gender,
    roles: partner.roles,
    status: partner.status,
    branchId: partner.branchId,
    salesRepId: partner.salesRepId,
    phone: partner.phone,
    email: partner.email,
    notes: partner.notes,
    categoryId: partner.categoryId,
    tagIds,
    leadSource: partner.leadSource,
    lastContactedAt: partner.lastContactedAt ? partner.lastContactedAt.toISOString() : null,
    nextFollowUpAt: partner.nextFollowUpAt ? partner.nextFollowUpAt.toISOString() : null,
    createdAt: partner.createdAt.toISOString(),
    updatedAt: partner.updatedAt.toISOString(),
  };
}

export async function getBusinessPartnerDto(id: string): Promise<BusinessPartner | null> {
  const partner = await prisma.businessPartner.findUnique({
    where: { id },
    include: { tags: { select: { tagId: true } } },
  });
  if (!partner || partner.isDeleted) return null;
  return mapPartnerToDto(
    partner,
    partner.tags.map((t) => t.tagId),
  );
}

/**
 * Business rule (00_REQUIREMENTS.md §28): a partner cannot be marked
 * Active without at least one valid contact method. Checks the values
 * that will be in effect after the given update is applied, not just
 * what's in the update payload alone.
 */
export function hasValidContactMethod(effective: {
  phone?: string | null;
  email?: string | null;
}): boolean {
  return Boolean(effective.phone?.trim() || effective.email?.trim());
}
