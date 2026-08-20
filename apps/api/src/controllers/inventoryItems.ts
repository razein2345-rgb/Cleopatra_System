import type { Request, Response } from 'express';
import {
  createInventoryItemSchema,
  createStockMovementSchema,
  updateInventoryItemSchema,
  updateStockMovementSchema,
} from '@cleopatra/shared';
import {
  createInventoryItem,
  deleteInventoryItem,
  deleteStockMovement,
  DuplicateBarcodeError,
  getInventoryItem,
  getInventoryItemByBarcode,
  InventoryItemInUseError,
  InventoryItemNotFoundError,
  listInventoryItems,
  listItemsNeedingSupplier,
  listStockMovements,
  recordStockMovement,
  StockMovementNotFoundError,
  updateInventoryItem,
  updateStockMovement,
} from '../services/inventoryService.js';
import { recordAudit } from '../services/auditService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof InventoryItemNotFoundError || err instanceof StockMovementNotFoundError) {
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

export async function listInventoryItemsHandler(_req: Request, res: Response) {
  const items = await listInventoryItems();
  res.json({ success: true, data: items });
}

/** "بضاعة ناقصة من الموردين" — items at/below reorder level or already negative. */
export async function listItemsNeedingSupplierHandler(_req: Request, res: Response) {
  const items = await listItemsNeedingSupplier();
  res.json({ success: true, data: items });
}

/** POS scan-to-add — exact match by barcode, not a fuzzy search (the scanner's raw input is the lookup key). */
export async function getInventoryItemByBarcodeHandler(req: Request<{ barcode: string }>, res: Response) {
  const item = await getInventoryItemByBarcode(req.params.barcode);
  if (!item) {
    res.status(404).json({ success: false, error: { message: 'مفيش صنف بهذا الباركود', code: 'BARCODE_NOT_FOUND' } });
    return;
  }
  res.json({ success: true, data: item });
}

export async function getInventoryItemHandler(req: Request<{ id: string }>, res: Response) {
  const item = await getInventoryItem(req.params.id);
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

/** Owner ("موظف المخزن مقدرش يجاوب 'الرصيد ده نزل امتى وليه'") — read-only, no Audit Log call (this is a view action, not a mutation). */
export async function listStockMovementsHandler(req: Request<{ id: string }>, res: Response) {
  const movements = await listStockMovements(req.params.id);
  res.json({ success: true, data: movements });
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

/** Owner (2026-08-20, "لا عايز اقدر اعدل الحركة واحذفها") — corrects an already-recorded movement's type/quantity/reference/date rather than only ever adding a new one. */
export async function updateStockMovementHandler(req: Request<{ id: string; movementId: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateStockMovementSchema.parse(req.body);

  let result;
  try {
    result = await updateStockMovement(req.params.movementId, input);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'StockMovement',
    entityId: req.params.movementId,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: auth.branchId,
    previousValue: { type: result.previous.type, quantity: result.previous.quantity, reference: result.previous.reference, date: result.previous.date },
    newValue: input,
  });

  res.json({ success: true, data: result.item });
}

export async function deleteStockMovementHandler(req: Request<{ id: string; movementId: string }>, res: Response) {
  const auth = req.auth!;

  let result;
  try {
    result = await deleteStockMovement(req.params.movementId, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({
    entityType: 'StockMovement',
    entityId: req.params.movementId,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: auth.branchId,
    previousValue: { type: result.previous.type, quantity: result.previous.quantity, reference: result.previous.reference, date: result.previous.date },
  });

  res.json({ success: true, data: result.item });
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
