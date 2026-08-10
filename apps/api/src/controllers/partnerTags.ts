import type { Request, Response } from 'express';
import { createPartnerTagSchema, updatePartnerTagSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { isTagInUse, mapTagToDto } from '../services/partnerTagService.js';
import { recordAudit } from '../services/auditService.js';

async function loadTagOr404(id: string, res: Response) {
  const tag = await prisma.partnerTag.findUnique({ where: { id } });
  if (!tag || tag.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Tag not found' } });
    return null;
  }
  return tag;
}

export async function listPartnerTags(_req: Request, res: Response) {
  const tags = await prisma.partnerTag.findMany({
    where: { isDeleted: false },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: tags.map(mapTagToDto) });
}

export async function createPartnerTag(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createPartnerTagSchema.parse(req.body);
  const tag = await prisma.partnerTag.create({ data: input });

  await recordAudit({
    entityType: 'PartnerTag',
    entityId: tag.id,
    action: 'CREATE_TAG',
    performedById: auth.staffId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: mapTagToDto(tag) });
}

export async function updatePartnerTag(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadTagOr404(req.params.id, res);
  if (!existing) return;

  const input = updatePartnerTagSchema.parse(req.body);
  const updated = await prisma.partnerTag.update({ where: { id: existing.id }, data: input });

  await recordAudit({
    entityType: 'PartnerTag',
    entityId: updated.id,
    action: 'UPDATE_TAG',
    performedById: auth.staffId,
    previousValue: { name: existing.name, isActive: existing.isActive },
    newValue: input,
  });

  res.json({ success: true, data: mapTagToDto(updated) });
}

/**
 * Soft delete only (ADR 0007), and only when the tag is not currently
 * assigned to any active partner (the explicit M4 "deleting an assigned
 * tag must be prevented" rule).
 */
export async function deletePartnerTag(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadTagOr404(req.params.id, res);
  if (!existing) return;

  if (await isTagInUse(existing.id)) {
    res.status(409).json({
      success: false,
      error: {
        message: 'Cannot delete a tag currently assigned to one or more business partners',
        code: 'TAG_IN_USE',
      },
    });
    return;
  }

  const deleted = await prisma.partnerTag.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
    select: { id: true },
  });

  await recordAudit({
    entityType: 'PartnerTag',
    entityId: deleted.id,
    action: 'DELETE_TAG',
    performedById: auth.staffId,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
