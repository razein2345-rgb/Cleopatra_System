import { z } from 'zod';
import type { Request, Response } from 'express';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { getOrCreateWalkInPartner } from '../services/posService.js';

const walkInPartnerSchema = z.object({ branchId: z.string().uuid() });

/**
 * POS / Cashier module — the only new write endpoint this feature needed.
 * Checkout itself reuses `POST /api/orders` (createOrder) untouched; this
 * just resolves the id of the shared "عميل نقدي" partner for a "بيع مباشر"
 * sale with no real customer chosen, so the POS page can pass it straight
 * through as `partnerId` on the existing order-creation payload.
 */
export async function getWalkInPartnerHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = walkInPartnerSchema.parse(req.body);

  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

  const partner = await getOrCreateWalkInPartner(input.branchId);
  res.json({ success: true, data: partner });
}
