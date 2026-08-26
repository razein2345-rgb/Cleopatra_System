import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateInventoryItemInput,
  CreateStockMovementInput,
  InventoryItem,
  QuickInventorySaleInput,
  StockMovement,
  TreasuryEntry,
  UpdateInventoryItemInput,
  UpdateStockMovementInput,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { assertBranchDayNotClosed, mapTreasuryEntryToDto } from './treasuryService.js';

type InventoryItemRecord = Prisma.InventoryItemGetPayload<{
  include: { stockLevels: true; sheetType: true; browsingCategory: true };
}>;

const INCLUDE = { stockLevels: true, sheetType: true, browsingCategory: true } satisfies Prisma.InventoryItemInclude;

/**
 * Owner (2026-08-20, "سجلنا في المخزون من جهاز محمد إن في أقلام روتو احمر
 * عدد 12 قلم ظاهرين عندي انا صفر") — `quantityOnHand` used to be scoped to
 * the *viewing* branch only (one `StockLevel` row per branch), so the same
 * physical item showed a different number depending who was looking and
 * from where — stock recorded at برينتنج هاوس was invisible from
 * كليوباترا. Confirmed explicitly: this business runs **one unified
 * warehouse**, not per-branch stock, so this now sums every branch's
 * `StockLevel` row into a single company-wide figure. `StockLevel` stays
 * split per branch internally (harmless bookkeeping — a movement still
 * records which branch/device it came from, useful for `listStockMovements`'
 * own history), but nothing reads a single branch's row in isolation
 * anymore.
 */
function mapInventoryItemToDto(record: InventoryItemRecord): InventoryItem {
  const quantityOnHand = record.stockLevels.reduce((sum, sl) => sum + sl.quantityOnHand.toNumber(), 0);
  const reorderLevel = record.reorderLevel?.toNumber() ?? null;
  return {
    id: record.id,
    category: record.category,
    categoryId: record.categoryId,
    categoryName: record.browsingCategory?.name ?? null,
    name: record.name,
    unit: record.unit,
    sheetTypeId: record.sheetTypeId,
    barcode: record.barcode,
    sheetPrice: record.sheetType?.price.toNumber() ?? null,
    salePrice: record.salePrice?.toNumber() ?? null,
    // SUPER_ADMIN-only financial field — always included here (this
    // service layer is auth-agnostic, same discipline as every other
    // mapper); inventoryItems.ts's controller strips it from the response
    // for anyone else, and rejects a write attempt that includes it.
    costPrice: record.costPrice?.toNumber() ?? null,
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

export async function listInventoryItems(): Promise<InventoryItem[]> {
  const records = await prisma.inventoryItem.findMany({
    where: { isDeleted: false },
    include: INCLUDE,
    orderBy: { name: 'asc' },
  });
  return records.map((r) => mapInventoryItemToDto(r));
}

/** "بضاعة ناقصة" — items at or below their reorder level, or already run negative by an order that outran stock. */
export async function listItemsNeedingSupplier(): Promise<InventoryItem[]> {
  const items = await listInventoryItems();
  return items.filter((item) => item.isLowStock || item.quantityOnHand < 0);
}

/** POS scan-to-add (system_specifications_v2.md §12.5, second pass 2026-08-16) — exact lookup by the scanner's raw input, `barcode` being `@unique` makes this O(1). */
export async function getInventoryItemByBarcode(barcode: string): Promise<InventoryItem | null> {
  const record = await prisma.inventoryItem.findUnique({ where: { barcode }, include: INCLUDE });
  if (!record || record.isDeleted) return null;
  return mapInventoryItemToDto(record);
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  const record = await prisma.inventoryItem.findUnique({ where: { id }, include: INCLUDE });
  if (!record || record.isDeleted) return null;
  return mapInventoryItemToDto(record);
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
          categoryId: input.categoryId ?? null,
          name: input.name,
          unit: input.unit,
          sheetTypeId: input.sheetTypeId ?? null,
          reorderLevel: input.reorderLevel ?? null,
          barcode: input.barcode ?? null,
          salePrice: input.salePrice ?? null,
          costPrice: input.costPrice ?? null,
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
  return mapInventoryItemToDto(created);
}

export async function updateInventoryItem(id: string, input: UpdateInventoryItemInput): Promise<InventoryItem> {
  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new InventoryItemNotFoundError();

  const updated = await prisma.$transaction(async (tx) => {
    let item;
    try {
      item = await tx.inventoryItem.update({
        where: { id },
        data: {
          name: input.name,
          category: input.category,
          categoryId: input.categoryId,
          reorderLevel: input.reorderLevel,
          barcode: input.barcode,
          salePrice: input.salePrice,
          costPrice: input.costPrice,
        },
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
  return mapInventoryItemToDto(updated);
}

/**
 * Records a manual stock movement (register goods / correct a count).
 * `IN` increases on-hand, `OUT` decreases it — the automatic `OUT` posted
 * by Order creation goes through `deductStockForOrderItem` below instead,
 * inside the same transaction as the order (mirrors the Payment+Treasury
 * atomic pattern), not this standalone entry point.
 */
/**
 * Shared by `recordStockMovement` and `quickSaleFromInventory` — the one
 * place a brand-new movement gets created + `StockLevel` adjusted, so the
 * two call sites can never drift apart (rule 5, "دوّر قبل ما تبني").
 */
async function createStockMovementTx(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  branchId: string,
  input: CreateStockMovementInput,
) {
  const delta = input.type === 'OUT' ? -input.quantity : input.quantity;
  const movement = await tx.stockMovement.create({
    data: { inventoryItemId, branchId, type: input.type, quantity: input.quantity, reference: input.reference ?? null },
  });
  await tx.stockLevel.upsert({
    where: { inventoryItemId_branchId: { inventoryItemId, branchId } },
    create: { inventoryItemId, branchId, quantityOnHand: delta },
    update: { quantityOnHand: { increment: delta } },
  });
  return movement;
}

export async function recordStockMovement(
  inventoryItemId: string,
  branchId: string,
  input: CreateStockMovementInput,
): Promise<InventoryItem> {
  const existing = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!existing || existing.isDeleted) throw new InventoryItemNotFoundError();

  const updated = await prisma.$transaction(async (tx) => {
    await createStockMovementTx(tx, inventoryItemId, branchId, input);
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId }, include: INCLUDE });
  });
  return mapInventoryItemToDto(updated);
}

export class NoSalePriceError extends Error {
  constructor() {
    super('لازم تحدد سعر البيع أولًا (سعر البيع مش متسجل على الصنف)');
    this.name = 'NoSalePriceError';
  }
}

/**
 * Owner (2026-08-20, "لو حد خد صنف بسيط من قسم بضاعة من المخزون مش مضطر
 * اطلع عليه فاتورة وعايزة يتسجل في حركة الخزينة ويخصمه من المخزن") — a
 * one-step cash sale with no Order/invoice: an `OUT` StockMovement and an
 * `INCOME` TreasuryEntry, created atomically and paired via
 * `TreasuryEntry.stockMovementId`. `unitPrice` defaults to the item's own
 * `salePrice` (same field `INVENTORY_RETAIL` order pricing reads), staff
 * can override it for a one-off discount/markup.
 */
export async function quickSaleFromInventory(
  inventoryItemId: string,
  branchId: string,
  staffId: string,
  input: QuickInventorySaleInput,
): Promise<{ item: InventoryItem; treasuryEntry: TreasuryEntry }> {
  const existing = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!existing || existing.isDeleted) throw new InventoryItemNotFoundError();

  const unitPrice = input.unitPrice ?? existing.salePrice?.toNumber();
  if (unitPrice === undefined) throw new NoSalePriceError();
  const discountPercent = input.discountPercent ?? 0;
  const amount = unitPrice * input.quantity * (1 - discountPercent / 100);
  const now = new Date();

  await assertBranchDayNotClosed(branchId, now);

  const result = await prisma.$transaction(async (tx) => {
    const movement = await createStockMovementTx(tx, inventoryItemId, branchId, {
      type: 'OUT',
      quantity: input.quantity,
      reference: input.note ?? 'بيع سريع',
    });
    const entry = await tx.treasuryEntry.create({
      data: {
        type: 'INCOME',
        amount,
        method: input.method,
        category: input.category ?? 'مبيعات نقدية',
        note:
          input.note ??
          `بيع سريع — ${existing.name} × ${input.quantity}${discountPercent > 0 ? ` (خصم ${discountPercent}%)` : ''}`,
        date: now,
        sourceType: 'QUICK_SALE',
        stockMovementId: movement.id,
        staffId,
        branchId,
      },
    });
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId }, include: INCLUDE });
    return { item, entry };
  });

  return { item: mapInventoryItemToDto(result.item), treasuryEntry: mapTreasuryEntryToDto(result.entry) };
}

/**
 * Owner ("موظف المخزن مقدرش يجاوب 'الرصيد ده نزل امتى وليه'") — every
 * StockMovement for this item, newest first, **across every branch**
 * (2026-08-20, "مخزون واحد موحّد" — a movement recorded from برينتنج هاوس
 * must be visible from كليوباترا too, same as the aggregate quantity
 * itself). Both order-driven (`deductStockForOrderItem`/
 * `restockForOrderItem`) and manual (`recordStockMovement`) rows already
 * land in the same table. Read-only, no write path changes.
 */
export async function listStockMovements(inventoryItemId: string): Promise<StockMovement[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { inventoryItemId, isDeleted: false },
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
): Promise<{ item: InventoryItem; previous: StockMovement; updatedTreasuryEntry: TreasuryEntry | null }> {
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
  const newBranchId = input.branchId ?? existing.branchId;
  const oldDelta = movementDelta(existing.type, existing.quantity.toNumber());
  const newDelta = movementDelta(newType, newQuantity);

  const { item: updated, entry: updatedEntry } = await prisma.$transaction(async (tx) => {
    await tx.stockMovement.update({
      where: { id: movementId },
      data: {
        type: newType,
        quantity: newQuantity,
        branchId: newBranchId,
        reference: input.reference,
        date: input.date !== undefined ? new Date(input.date) : undefined,
      },
    });
    if (newBranchId === existing.branchId) {
      await tx.stockLevel.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId } },
        create: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId, quantityOnHand: newDelta - oldDelta },
        update: { quantityOnHand: { increment: newDelta - oldDelta } },
      });
    } else {
      // Branch changed (2026-08-24, "عايز اغير الفرع في عملية بيع سريع") —
      // pull the movement's whole effect off the old branch's StockLevel row
      // and apply it to the new one, same delta-increment style, not a
      // re-derive-from-scratch. `quantityOnHand` itself is already summed
      // company-wide (see `mapInventoryItemToDto`'s own comment) so this
      // doesn't change the total — only which branch's row records it,
      // which `listStockMovements`'/audit history still cares about.
      await tx.stockLevel.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId } },
        create: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId, quantityOnHand: -oldDelta },
        update: { quantityOnHand: { increment: -oldDelta } },
      });
      await tx.stockLevel.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: existing.inventoryItemId, branchId: newBranchId } },
        create: { inventoryItemId: existing.inventoryItemId, branchId: newBranchId, quantityOnHand: newDelta },
        update: { quantityOnHand: { increment: newDelta } },
      });
    }

    // Owner (2026-08-20, "تعديل/حذف حركة المخزون بيرجّع قيد الخزينة
    // تلقائيًا") — a quick-sale movement's quantity edit rescales its paired
    // TreasuryEntry proportionally (same unit price, new quantity), keeping
    // the cash figure and the stock figure from ever drifting apart.
    // `branchId` (2026-08-24, "عايز اغير الفرع في عملية بيع سريع") — the
    // Treasury page's "الفرع" column reads `TreasuryEntry.branchId`, a
    // separate column from `StockMovement.branchId`; carry the same new
    // branch onto the linked entry so the two never drift apart, same
    // discipline as the amount rescale right above.
    const linkedEntry = await tx.treasuryEntry.findFirst({
      where: { stockMovementId: movementId, isDeleted: false },
    });
    let entry = null;
    if (linkedEntry) {
      const unitPrice = linkedEntry.amount.toNumber() / previous.quantity;
      entry = await tx.treasuryEntry.update({
        where: { id: linkedEntry.id },
        data: { amount: unitPrice * newQuantity, branchId: newBranchId },
      });
    }

    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: existing.inventoryItemId }, include: INCLUDE });
    return { item, entry };
  });

  return { item: mapInventoryItemToDto(updated), previous, updatedTreasuryEntry: updatedEntry ? mapTreasuryEntryToDto(updatedEntry) : null };
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
): Promise<{ item: InventoryItem; previous: StockMovement; reversedTreasuryEntry: TreasuryEntry | null }> {
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

  const { item: updated, entry: reversedEntry } = await prisma.$transaction(async (tx) => {
    await tx.stockMovement.update({
      where: { id: movementId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy },
    });
    await tx.stockLevel.upsert({
      where: { inventoryItemId_branchId: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId } },
      create: { inventoryItemId: existing.inventoryItemId, branchId: existing.branchId, quantityOnHand: -oldDelta },
      update: { quantityOnHand: { increment: -oldDelta } },
    });

    // Owner (2026-08-20, "تعديل/حذف حركة المخزون بيرجّع قيد الخزينة
    // تلقائيًا") — reverses the paired cash effect the same way the stock
    // effect is reversed above, same soft-delete + Audit Log discipline as
    // every other sensitive delete in this codebase (rule 19).
    const linkedEntry = await tx.treasuryEntry.findFirst({
      where: { stockMovementId: movementId, isDeleted: false },
    });
    let entry = null;
    if (linkedEntry) {
      entry = await tx.treasuryEntry.update({
        where: { id: linkedEntry.id },
        data: { isDeleted: true, deletedAt: new Date(), deletedBy },
      });
    }

    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: existing.inventoryItemId }, include: INCLUDE });
    return { item, entry };
  });

  return { item: mapInventoryItemToDto(updated), previous, reversedTreasuryEntry: reversedEntry ? mapTreasuryEntryToDto(reversedEntry) : null };
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
  reference: string = 'رد استهلاك — تعديل/حذف أوردر',
): Promise<void> {
  await tx.stockMovement.create({
    data: { inventoryItemId, branchId, type: 'IN', quantity: sheetsConsumed, reference },
  });
  await tx.stockLevel.upsert({
    where: { inventoryItemId_branchId: { inventoryItemId, branchId } },
    create: { inventoryItemId, branchId, quantityOnHand: sheetsConsumed },
    update: { quantityOnHand: { increment: sheetsConsumed } },
  });
}
