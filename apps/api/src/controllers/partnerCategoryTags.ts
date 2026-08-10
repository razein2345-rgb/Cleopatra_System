import type { Request, Response } from 'express';
import { setPartnerCategorySchema, setPartnerTagsSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { mapPartnerToDto } from '../services/businessPartnerService.js';
import { loadPartnerOr404 } from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';

/**
 * Only entry point that may change `categoryId` — a plain nullable FK on
 * BusinessPartner itself (zero-or-one Category, M4), so no exclusivity
 * lock is needed here the way ContactPerson.isPrimary/PartnerAddress.
 * isDefault need one: there is exactly one FK column to update, not a
 * flag to move between sibling rows.
 */
export async function setPartnerCategory(req: Request<{ partnerId: string }>, res: Response) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;

  const input = setPartnerCategorySchema.parse(req.body);

  if (input.categoryId !== null) {
    const category = await prisma.partnerCategory.findUnique({
      where: { id: input.categoryId },
    });
    if (!category || category.isDeleted) {
      res.status(404).json({ success: false, error: { message: 'Category not found' } });
      return;
    }
    if (!category.isActive) {
      res.status(400).json({
        success: false,
        error: {
          message: 'An inactive category cannot be assigned',
          code: 'INACTIVE_CATEGORY',
        },
      });
      return;
    }
  }

  const current = await prisma.businessPartner.findUnique({
    where: { id: partner.id },
    select: { categoryId: true },
  });

  if ((current?.categoryId ?? null) === input.categoryId) {
    const unchanged = await prisma.businessPartner.findUniqueOrThrow({
      where: { id: partner.id },
      include: { tags: { select: { tagId: true } } },
    });
    res.json({
      success: true,
      data: mapPartnerToDto(
        unchanged,
        unchanged.tags.map((t) => t.tagId),
      ),
    });
    return;
  }

  const updated = await prisma.businessPartner.update({
    where: { id: partner.id },
    data: { categoryId: input.categoryId },
    include: { tags: { select: { tagId: true } } },
  });

  await recordAudit({
    entityType: 'BusinessPartner',
    entityId: partner.id,
    action: 'CATEGORY_CHANGED',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: { categoryId: current?.categoryId ?? null },
    newValue: { categoryId: input.categoryId },
  });

  res.json({
    success: true,
    data: mapPartnerToDto(
      updated,
      updated.tags.map((t) => t.tagId),
    ),
  });
}

/**
 * Only entry point that may change a partner's Tag set — replaces it
 * wholesale in one call (unlimited Tags per partner, M4). This is a plain
 * set-replace, not an "exactly one per group" invariant, so it
 * deliberately does NOT use the `setExclusiveDefault` lock pattern from
 * `partnerChildEntity.ts` — that pattern exists for a different concern
 * (ContactPerson.isPrimary / PartnerAddress.isDefault) and reusing it here
 * would misapply it. A plain transaction (delete all, insert the new set)
 * is sufficient: last-write-wins on a full set-replace is acceptable,
 * unlike two rows both claiming to be "the" primary/default.
 */
export async function setPartnerTags(req: Request<{ partnerId: string }>, res: Response) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;

  const input = setPartnerTagsSchema.parse(req.body);
  const tagIds = Array.from(new Set(input.tagIds));

  if (tagIds.length > 0) {
    const tags = await prisma.partnerTag.findMany({ where: { id: { in: tagIds } } });
    const foundIds = new Set(tags.map((t) => t.id));
    const missing = tagIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      res.status(404).json({ success: false, error: { message: 'One or more tags not found' } });
      return;
    }
    const unusable = tags.filter((t) => t.isDeleted || !t.isActive);
    if (unusable.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Inactive tags cannot be assigned',
          code: 'INACTIVE_TAG',
        },
      });
      return;
    }
  }

  const before = await prisma.businessPartnerTag.findMany({
    where: { partnerId: partner.id },
    select: { tagId: true },
  });
  const beforeTagIds = before.map((t) => t.tagId);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.businessPartnerTag.deleteMany({ where: { partnerId: partner.id } });
    if (tagIds.length > 0) {
      await tx.businessPartnerTag.createMany({
        data: tagIds.map((tagId) => ({ partnerId: partner.id, tagId })),
      });
    }
    return tx.businessPartner.findUniqueOrThrow({
      where: { id: partner.id },
      include: { tags: { select: { tagId: true } } },
    });
  });

  await recordAudit({
    entityType: 'BusinessPartner',
    entityId: partner.id,
    action: 'TAGS_CHANGED',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: { tagIds: beforeTagIds },
    newValue: { tagIds },
  });

  res.json({
    success: true,
    data: mapPartnerToDto(
      updated,
      updated.tags.map((t) => t.tagId),
    ),
  });
}
