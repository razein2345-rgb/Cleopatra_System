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
