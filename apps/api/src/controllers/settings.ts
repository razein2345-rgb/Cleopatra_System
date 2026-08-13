import type { Request, Response } from 'express';
import { updateSettingSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { serializeDecimals } from '../utils/serialize.js';

export async function getSettings(_req: Request, res: Response) {
  const setting = await prisma.setting.findFirst();
  if (!setting) {
    res
      .status(404)
      .json({ success: false, error: { message: 'Settings have not been initialized yet' } });
    return;
  }
  res.json({ success: true, data: serializeDecimals(setting) });
}

/**
 * FEATURE-007 — the letterhead-only slice of Settings, reachable by
 * anyone who can view an Order/Quotation/WorkOrder to print it (gated on
 * `orders.view` at the route, not `settings.view`).
 */
export async function getBusinessIdentity(_req: Request, res: Response) {
  const setting = await prisma.setting.findFirst({
    select: {
      businessNameAr: true,
      businessNameEn: true,
      businessTagline: true,
      address: true,
      phone: true,
      email: true,
      website: true,
      taxNumber: true,
      commercialRegisterNumber: true,
      logoUrl: true,
      stampUrl: true,
      landlinePhone: true,
      facebookUrl: true,
      showStampOnInvoice: true,
      showQuotationDate: true,
      showQuotationSignatureArea: true,
      showQuotationDocumentNumber: true,
      showInvoiceAddress: true,
      showInvoicePhone: true,
      showInvoiceEmail: true,
      showInvoiceLandline: true,
      showInvoiceFacebook: true,
    },
  });
  if (!setting) {
    res
      .status(404)
      .json({ success: false, error: { message: 'Settings have not been initialized yet' } });
    return;
  }
  res.json({ success: true, data: setting });
}

/**
 * FEATURE-007 — the top bar's logo (owner, 2026-08-12: "عايز احط اللوجو
 * في السيستم فوق"), shown to every logged-in staff member regardless of
 * role/permissions — same "low-sensitivity reference data" reasoning
 * `listBranches` already uses, not the letterhead endpoint's deliberately
 * narrower `orders.view` gate.
 */
export async function getBranding(_req: Request, res: Response) {
  const setting = await prisma.setting.findFirst({
    select: { businessNameAr: true, logoUrl: true },
  });
  res.json({ success: true, data: setting ?? { businessNameAr: null, logoUrl: null } });
}

export async function updateSettings(req: Request, res: Response) {
  const input = updateSettingSchema.parse(req.body);
  const existing = await prisma.setting.findFirst();
  if (!existing) {
    res
      .status(404)
      .json({ success: false, error: { message: 'Settings have not been initialized yet' } });
    return;
  }
  const updated = await prisma.setting.update({ where: { id: existing.id }, data: input });
  res.json({ success: true, data: serializeDecimals(updated) });
}
