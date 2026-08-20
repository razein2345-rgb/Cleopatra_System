import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateInventoryItemInput,
  CreateStockMovementInput,
  InventoryItem,
  StockMovement,
  UpdateInventoryItemInput,
  UpdateStockMovementInput,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

type InventoryItemRecord = Prisma.InventoryItemGetPayload<{
  include: { stockLevels: true; sheetType: true };
}>;

const INCLUDE = { stockLevels: true, sheetType: true } satisfies Prisma.InventoryItemInclude;

/** `quantityOnHand`/`isLowStock` are for the given branch — a multi-branch item has one StockLevel row per branch. */
function mapInventoryItemToDto(record: InventoryItemRecord, branchId: string): InventoryItem {
  const quantityOnHand = record.stockLevels.find((sl) => sl.branchId === branchId)?.quantityOnHand.toNumber() ?? 0;
  const reorderLevel = record.reorderLevel?.toNumber() ?? null;
  return {
    id: record.id,
    category: record.category,
    name: record.name,
    unit: record.unit,
    sheetTypeId: record.sheetTypeId,
    barcode: record.barcode,
    sheetPrice: record.sheetType?.price.toNumber() ?? null,
    salePrice: record.salePrice?.toNumber() ?? null,
    reorderLevel,
    quantityOnHand,
    // Owner (2026-08-20, "ازاي مكتوب متوفر والعدد صفر لكل الأفرخ اللي
    // محطوطة؟") — zero (or negative) stock is always "low"/needs
    // attention, whether or not anyone bothered to configure a reorder
    // threshold for that item. The threshold check stays for items that
    // still have stock but are running low.
    isLowStock: quantityOnHand <= 0 || (reorderLevel !== null && quantityOnHand <= reorderLevel),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class InventoryItemNotFoundError extends Error {
  constructor() {
    super('Inventory item not found');
    this.name = 'InventoryItemNotFoundError';
  }
}

export class InventoryItemInUseError extends Error {
  constructor() {
    super('This inventory item is referenced by at least one order and cannot be deleted');
    this.name = 'InventoryItemInUseError';
  }
}

export class DuplicateBarcodeError extends Error {
  constructor() {
    super('This barcode is already assigned to another item');
    this.name = 'DuplicateBarcodeError';
  }
}

export class StockMovementNotFoundError extends Error {
  constructor() {
    super('Stock movement not found');
    this.name = 'StockMovementNotFoundError';
  }
}

/**
 * Prisma P2002 (unique constraint) on `barcode` — surfaced as a friendly,
 * specific error rather than a raw 500. The field list showing which
 * unique constraint was hit lives in different places depending on the
 * Prisma engine: classic `meta.target` (array of field names) vs. the
 * Prisma 7 driver-adapter shape observed here, which nests it at
 * `meta.driverAdapterError.cause.constraint.fields` — check both.
 */
function isDuplicateBarcodeError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || (err as { code?: string }).code !== 'P2002') return false;
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return false;

  const target = (meta as { target?: unknown }).target;
  if (Array.isArray(target) && target.includes('barcode')) return true;

  const driverFields = (
    meta as {
      driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
    }
  ).driverAdapterError?.cause?.constraint?.fields;
  return Array.isArray(driverFields) && driverFields.includes('barcode');
}

export async function listInventoryItems(branchId: string): Promise<InventoryItem[]> {
  const records = await prisma.inventoryItem.findMany({
    where: { isDeleted: false },
    include: INCLUDE,
    orderBy: { name: 'asc' },
  });
  return records.map((r) => mapInventoryItemToDto(r, branchId));
}

/** "بضاعة ناقصة" — items at or below their reorder level, or already run negative by an order that outran stock. */
export async function listItemsNeedingSupplier(branchId: string): Promise<InventoryItem[]> {
  const items = await listInventoryItems(branchId);
  return items.filter((item) => item.isLowStock || item.quantityOnHand < 0);
}

/** POS scan-to-add (system_specifications_v2.md §12.5, second pass 2026-08-16) — exact lookup by the scanner's raw input, `barcode` being `@unique` makes this O(1). */
export async function getInventoryItemByBarcode(barcode: string, branchId: string): Promise<InventoryItem | null> {
  const record = await prisma.inventoryItem.findUnique({ where: { barcode }, include: INCLUDE });
  if (!record || record.isDeleted) return null;
  return mapInventoryItemToDto(record, branchId);
}

export async function getInventoryItem(id: string, branchId: string): Promise<InventoryItem | null> {
  const record = await prisma.inventoryItem.findUnique({ where: { id }, include: INCLUDE });
  if (!record || record.isDeleted) return null;
  return mapInventoryItemToDto(record, branchId);
}

/** Registers a new stock item — `initialQuantity` (the owner's "اسجل عليه البضاعه اللي عندي" ask) is recorded as an `IN` movement, not written directly onto `StockLevel`. */
export async function createInventoryItem(
  input: CreateInventoryItemInput,
  branchId: string,
): Promise<InventoryItem> {
  const created = await prisma.$transaction(async (tx) => {
    let item;
    try {
      item = await tx.inventoryItem.create({
        data: {
          category: input.category,
          name: input.name,
          unit: input.unit,
          sheetTypeId: input.sheetTypeId ?? null,
          reorderLevel: input.reorderLevel ?? null,
          barcode: input.barcode ?? null,
          salePrice: input.salePrice ?? null,
        },
      });
    } catch (err) {
      if (isDuplicateBarcodeError(err)) throw new DuplicateBarcodeError();
      throw err;
    }

    if (input.initialQuantity && input.initialQuantity > 0) {
      await tx.stockMovement.create({
        data: {
          inventoryItemId: item.id,
          branchId,
          type: 'IN',
          quantity: input.initialQuantity,
          reference: 'رصيد افتتاحي',
        },
      });
      await tx.stockLevel.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: item.id, branchId } },
        create: { inventoryItemId: item.id, branchId, quantityOnHand: input.initialQuantity },
        update: { quantityOnHand: { increment: input.initialQuantity } },
      });
    }

    return tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id }, include: INCLUDE });
  });
  return mapInventoryItemToDto(created, branchId);
}

export async function updateInventoryItem(id: string, input: UpdateInventoryItemInput): Promise<InventoryItem> {
  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new InventoryItemNotFoundError();

  const updated = await prisma.$transaction(async (tx) => {
    let item;
    try {
      item = await tx.inventoryItem.update({
        where: { id },
        data: { name: input.name, reorderLevel: input.reorderLevel, barcode: input.barcode, salePrice: input.salePrice },
        include: INCLUDE,
      });
    } catch (err) {
      if (isDuplicateBarcodeError(err)) throw new DuplicateBarcodeError();
      throw err;
    }
    // The reverse of sheetTypes.ts's own SheetType → InventoryItem name
    // sync — a paper item renamed from the Inventory page keeps its
    // linked SheetType's catalog name in step, so "أنواع الورق" and the
    // Orders paper dropdown never show two different names for the same
    // physical stock.
    if (input.name !== undefined && item.sheetTypeId) {
      await tx.sheetType.update({ where: { id: item.sheetTypeId }, data: { name: input.name } });
    }
    return item;
  });
  // reorderLevel/quantityOnHand is branch-scoped for the DTO, but this
  // update path isn't branch-specific — any branch value works to shape
  // the response since reorderLevel itself is not per-branch.
  return mapInventoryItemToDto(updated, updated.stockLevels[0]?.branchId ?? '');
}

/**
 * Records a manual stock movement (register goods / correct a count).
 * `IN` increases on-hand, `OUT` decreases it — the automatic `OUT` posted
 * by Order creation goes through `deductStockForOrderItem` below instead,
 * inside the same transaction as the order (mirrors the Payment+Treasury
 * atomic pattern), not this standalone entry point.
 */
export async function recordStockMovement(
  inventoryItemId: string,
  branchId: string,
  input: CreateStockMovementInput,
): Promise<InventoryItem> {
  const existing = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!existing || existing.isDeleted) throw new InventoryItemNotFoundError();

  const delta = input.type === 'OUT' ? -input.quantity : input.quantity;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.stockMovement.create({
      data: { inventoryItemId, branchId, type: input.type, quantity: input.quantity, reference: input.reference ?? null },
    });
    await tx.stockLevel.upsert({
      where: { inventoryItemId_branchId: { inventoryItemId, branchId } },
      create: { inventoryItemId, branchId, quantityOnHand: delta },
      update: { quantityOnHand: { increment: delta } },
    });
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId }, include: INCLUDE });
  });
  return mapInventoryItemToDto(updated, branchId);
}

/** Owner ("موظف المخزن مقدرش يجاوب 'الرصيد ده نزل امتى وليه'") — every StockMovement for this item, newest first: both order-driven (`deductStockForOrderItem`/`restockForOrderItem`) and manual (`recordStockMovement`) rows already land in the same table. Read-only, no write path changes. */
export async function listStockMovements(inventoryItemId: string, branchId: string): Promise<StockMovement[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { inventoryItemId, branchId, isDeleted: false },
    orderBy: { date: 'desc' },
  });
  return rows.map((m) => ({
    id: m.id,
    inventoryItemId: m.inventoryItemId,
    branchId: m.branchId,
    type: m.type,
    quantity: m.quantity.toNumber(),
    reference: m.reference,
    date: m.date.toISOString(),
    createdAt: m.createdAt.toISOString(),
  }));
}

function movementDelta(type: 'IN' | 'OUT' | 'ADJUSTMENT', quantity: number): number {
  return type === 'OUT' ? -quantity : quantity;
}

/**
 * Owner (2026-08-20, "لا عايز اقدر اعدل الحركة واحذفها") — corrects an
 * already-recorded movement's type/quantity/reference/date. `StockLevel`
 * is re-adjusted by the *difference* between the old and new delta inside
 * the same transaction, never by re-deriving the whole balance from
 * scratch, mirroring `recordStockMovement`'s own upsert-by-increment style.
 */
export async function updateStockMovement(
  movementId: string,
  input: UpdateStockMovementInput,
): Promise<{ item: InventoryItem; previous: StockMovement }> {
  const existing = await prisma.stockMovement.findUnique({ where: { id: movementId } });
  if (!existing || existing.isDeleted) throw new StockMovementNotFoundError();

  const previous: StockMovement = {
    id: existing.id,
    inventoryItemId: existing.inventoryItemId,
    branchId: existing.branchId,
    type: existing.type,
    quantity: existing.quantity.toNumber(),
    reference: existing.reference,
    date: existing.date.toISOString(),
    createdAt: existing.createdAt.toISOString(),
  };

  const newType = input.type ?? existing.type;
  const newQuantity = input.quantity ?? existing.quantity.toNumber();
  const oldDelta = movementDelta(existing.type, existing.quantity.toNumber());
  const newDelta = movementDelta(newType, newQuantity);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.stockMovement.update({
      where: { id: movementId },
      data: {
        type: newType,
        quantity: newQuantity,
        reference: input.reference,
        date: input.date !== undefined ? new Date(input.date) : undefined,
      },
    });
    await tx.stockLevel.upsert({
      where: { inventoryItemId_branchId: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId } },
      create: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId, quantityOnHand: newDelta - oldDelta },
      update: { quantityOnHand: { increment: newDelta - oldDelta } },
    });
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: existing.inventoryItemId }, include: INCLUDE });
  });

  return { item: mapInventoryItemToDto(updated, existing.branchId), previous };
}

/**
 * Soft-delete (rule 19) — reverses the movement's effect on `StockLevel`
 * by the same increment-based math `updateStockMovement` uses (delta to
 * zero, i.e. `-oldDelta`), then marks the row deleted rather than removing
 * it, so the audit trail this same feature request also implies stays
 * intact.
 */
export async function deleteStockMovement(
  movementId: string,
  deletedBy: string,
): Promise<{ item: InventoryItem; previous: StockMovement }> {
  const existing = await prisma.stockMovement.findUnique({ where: { id: movementId } });
  if (!existing || existing.isDeleted) throw new StockMovementNotFoundError();

  const previous: StockMovement = {
    id: existing.id,
    inventoryItemId: existing.inventoryItemId,
    branchId: existing.branchId,
    type: existing.type,
    quantity: existing.quantity.toNumber(),
    reference: existing.reference,
    date: existing.date.toISOString(),
    createdAt: existing.createdAt.toISOString(),
  };
  const oldDelta = movementDelta(existing.type, existing.quantity.toNumber());

  const updated = await prisma.$transaction(async (tx) => {
    await tx.stockMovement.update({
      where: { id: movementId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy },
    });
    await tx.stockLevel.upsert({
      where: { inventoryItemId_branchId: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId } },
      create: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId, quantityOnHand: -oldDelta },
      update: { quantityOnHand: { increment: -oldDelta } },
    });
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: existing.inventoryItemId }, include: INCLUDE });
  });

  return { item: mapInventoryItemToDto(updated, existing.branchId), previous };
}

export async function deleteInventoryItem(id: string, deletedBy: string): Promise<void> {
  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new InventoryItemNotFoundError();

  const referencedCount = await prisma.orderItem.count({ where: { inventoryItemId: id } });
  if (referencedCount > 0) throw new InventoryItemInUseError();

  await prisma.inventoryItem.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy },
  });
}

/**
 * The auto-deduct half of FEATURE-007's locked decision: never blocks
 * order creation, even when it drives `quantityOnHand` negative — the
 * shortfall then surfaces via `listItemsNeedingSupplier`. Called from
 * inside `orderService.createOrder`'s own transaction (`tx`), not a
 * standalone call — deduction and the order it belongs to must succeed or
 * fail together.
 */
export async function deductStockForOrderItem(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  branchId: string,
  sheetsConsumed: number,
): Promise<void> {
  await tx.stockMovement.create({
    data: { inventoryItemId, branchId, type: 'OUT', quantity: sheetsConsumed, reference: 'استهلاك أوردر' },
  });
  await tx.stockLevel.upsert({
    where: { inventoryItemId_branchId: { inventoryItemId, branchId } },
    create: { inventoryItemId, branchId, quantityOnHand: -sheetsConsumed },
    update: { quantityOnHand: { decrement: sheetsConsumed } },
  });
}

/**
 * FEATURE-007 — the inverse of `deductStockForOrderItem`, used when
 * editing an Order's items (the old item's consumption is reversed before
 * the new items deduct fresh — owner, 2026-08-12: "يرجع للمخزن تلقائيًا")
 * or deleting an Order outright. Same transaction-scoped, atomic-with-its-
 * caller discipline as the deduct half.
 */
export async function restockForOrderItem(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  branchId: string,
  sheetsConsumed: number,
): Promise<void> {
  await tx.stockMovement.create({
    data: { inventoryItemId, branchId, type: 'IN', quantity: sheetsConsumed, reference: 'رد استهلاك — تعديل/حذف أوردر' },
  });
  await tx.stockLevel.upsert({
    where: { inventoryItemId_branchId: { inventoryItemId, branchId } },
    create: { inventoryItemId, branchId, quantityOnHand: sheetsConsumed },
    update: { quantityOnHand: { increment: sheetsConsumed } },
  });
}
