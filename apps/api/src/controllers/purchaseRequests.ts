import type { Request, Response } from 'express';
import { markPurchaseRequestPurchasedSchema, purchaseRequestStatusSchema } from '@cleopatra/shared';
import {
  listPurchaseRequests,
  markPurchaseRequestPurchased,
  PurchaseRequestAlreadyPurchasedError,
  PurchaseRequestNotFoundError,
} from '../services/purchaseRequestService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof PurchaseRequestNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  if (err instanceof PurchaseRequestAlreadyPurchasedError) {
    res.status(409).json({ success: false, error: { message: err.message, code: 'ALREADY_PURCHASED' } });
    return true;
  }
  return false;
}

export async function listPurchaseRequestsHandler(req: Request, res: Response) {
  const status = purchaseRequestStatusSchema.optional().parse(req.query.status);
  const items = await listPurchaseRequests(status);
  res.json({ success: true, data: items });
}

export async function markPurchaseRequestPurchasedHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = markPurchaseRequestPurchasedSchema.parse(req.body);
  try {
    const updated = await markPurchaseRequestPurchased(req.params.id, input, auth.branchId, auth.staffId);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}
