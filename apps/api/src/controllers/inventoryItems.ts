import type { Request, Response } from 'express';
import { createInventoryItemSchema, createStockMovementSchema, updateInventoryItemSchema } from '@cleopatra/shared';
import {
  createInventoryItem,
  deleteInventoryItem,
  DuplicateBarcodeError,
  getInventoryItem,
  InventoryItemInUseError,
  InventoryItemNotFoundError,
  listInventoryItems,
  listItemsNeedingSupplier,
  recordStockMovement,
  updateInventoryItem,
} from '../services/inventoryService.js';
import { recordAudit } from '../services/auditService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof InventoryItemNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  if (err instanceof InventoryItemInUseError) {
    res.status(409).json({ success: false, error: { message: err.message, code: 'INVENTORY_ITEM_IN_USE' } });
    return true;
  }
  if (err instanceof DuplicateBarcodeError) {
    res.status(409).json({ success: false, error: { message: err.message, code: 'DUPLICATE_BARCODE' } });
    return true;
  }
  return false;
}

export async function listInventoryItemsHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const items = await listInventoryItems(auth.branchId);
  res.json({ success: true, data: items });
}

/** "بضاعة ناقصة من الموردين" — items at/below reorder level or already negative. */
export async function listItemsNeedingSupplierHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const items = await listItemsNeedingSupplier(auth.branchId);
  res.json({ success: true, data: items });
}

export async function getInventoryItemHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const item = await getInventoryItem(req.params.id, auth.branchId);
  if (!item) {
    res.status(404).json({ success: false, error: { message: 'Inventory item not found' } });
    return;
  }
  res.json({ success: true, data: item });
}

export async function createInventoryItemHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createInventoryItemSchema.parse(req.body);

  let created;
  try {
    created = await createInventoryItem(input, auth.branchId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'InventoryItem',
    entityId: created.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: auth.branchId,
    newValue: { name: created.name, category: created.category, quantityOnHand: created.quantityOnHand },
  });

  res.status(201).json({ success: true, data: created });
}

export async function updateInventoryItemHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateInventoryItemSchema.parse(req.body);

  let updated;
  try {
    updated = await updateInventoryItem(req.params.id, input);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'InventoryItem',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: auth.branchId,
    newValue: input,
  });

  res.json({ success: true, data: updated });
}

export async function recordStockMovementHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = createStockMovementSchema.parse(req.body);

  let updated;
  try {
    updated = await recordStockMovement(req.params.id, auth.branchId, input);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'InventoryItem',
    entityId: req.params.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: auth.branchId,
    newValue: { type: input.type, quantity: input.quantity, reference: input.reference },
  });

  res.json({ success: true, data: updated });
}

export async function deleteInventoryItemHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  try {
    await deleteInventoryItem(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'InventoryItem',
    entityId: req.params.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: auth.branchId,
  });

  res.json({ success: true, data: { id: req.params.id } });
}
