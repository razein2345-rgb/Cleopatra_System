import type { Request, Response } from 'express';
import type { Prisma } from '../generated/prisma/client.js';
import { createOrderTemplateSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { mapOrderTemplateToDto } from '../services/orderTemplateService.js';
import { recordAudit } from '../services/auditService.js';

async function loadTemplateOr404(id: string, res: Response) {
  const template = await prisma.orderTemplate.findUnique({ where: { id } });
  if (!template || template.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Order template not found' } });
    return null;
  }
  return template;
}

/** Owner (2026-08-17) — "قالب دوري" is deliberately not customer-locked (see OrderTemplate's own schema comment), so this lists every template regardless of who created it or which branch — the composer's "تحميل من قالب" picker needs the full list. */
export async function listOrderTemplates(_req: Request, res: Response) {
  const templates = await prisma.orderTemplate.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: templates.map(mapOrderTemplateToDto) });
}

export async function createOrderTemplate(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createOrderTemplateSchema.parse(req.body);

  const template = await prisma.orderTemplate.create({
    data: {
      name: input.name,
      branchId: input.branchId,
      partnerId: input.partnerId,
      createdById: auth.staffId,
      itemsSnapshot: input.itemsSnapshot as unknown as Prisma.InputJsonValue,
    },
  });

  await recordAudit({
    entityType: 'OrderTemplate',
    entityId: template.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: template.branchId,
    partnerId: template.partnerId,
    newValue: { name: input.name, itemCount: input.itemsSnapshot.length },
  });

  res.status(201).json({ success: true, data: mapOrderTemplateToDto(template) });
}

/** Soft delete only (ADR 0007). */
export async function deleteOrderTemplate(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await loadTemplateOr404(req.params.id, res);
  if (!existing) return;

  const deleted = await prisma.orderTemplate.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
    select: { id: true, branchId: true, partnerId: true },
  });

  await recordAudit({
    entityType: 'OrderTemplate',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: deleted.branchId,
    partnerId: deleted.partnerId,
    previousValue: { name: existing.name },
  });

  res.json({ success: true, data: { id: deleted.id } });
}
