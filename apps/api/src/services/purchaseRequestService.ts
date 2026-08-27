import type { Prisma } from '../generated/prisma/client.js';
import type { MarkPurchaseRequestPurchasedInput, PurchaseRequest, PurchaseRequestStatus } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

/**
 * "قائمة شراء عاجل" — parts 2 and 3 of the supplier-linkage initiative.
 * Two origins share this one queue/"اتشرت" flow (see `PurchaseRequestKind`
 * in schema.prisma for the full reasoning): `STOCK_SHORTFALL` (an
 * `InventoryItem` went negative — `maybeCreatePurchaseRequest`, called
 * from `orderService.ts` right after a stock deduction) has a real
 * quantity/stock effect; `BOARDS_PURCHASE`/`BOARDS_ASSEMBLY` (a
 * `BoardsCatalogItem` order, e.g. a Roll-Up — `createBoardsCatalogPurchaseRequests`,
 * called right after that OrderItem is created) has no stock concept at
 * all, just a supplier obligation to book. Neither path is a
 * caller-composed create endpoint — there is no `createPurchaseRequest`
 * here, only the two auto-triggers and the "mark purchased" completion.
 */

const INCLUDE = {
  inventoryItem: { select: { name: true } },
  boardsCatalogItem: { select: { name: true } },
  supplier: { select: { nameAr: true } },
  order: { select: { invoiceNumber: true } },
  purchasedBy: { select: { name: true } },
} satisfies Prisma.PurchaseRequestInclude;

type PurchaseRequestRecord = Prisma.PurchaseRequestGetPayload<{ include: typeof INCLUDE }>;

function mapPurchaseRequestToDto(row: PurchaseRequestRecord): PurchaseRequest {
  return {
    id: row.id,
    kind: row.kind,
    inventoryItemId: row.inventoryItemId,
    inventoryItemName: row.inventoryItem?.name ?? null,
    boardsCatalogItemId: row.boardsCatalogItemId,
    boardsCatalogItemName: row.boardsCatalogItem?.name ?? null,
    supplierId: row.supplierId,
    supplierName: row.supplier?.nameAr ?? null,
    orderId: row.orderId,
    orderInvoiceNumber: row.order.invoiceNumber,
    orderItemId: row.orderItemId,
    quantityNeeded: row.quantityNeeded?.toNumber() ?? null,
    status: row.status,
    purchasedQuantity: row.purchasedQuantity?.toNumber() ?? null,
    purchasedAmount: row.purchasedAmount?.toNumber() ?? null,
    purchasedAt: row.purchasedAt?.toISOString() ?? null,
    purchasedByName: row.purchasedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPurchaseRequests(status?: PurchaseRequestStatus): Promise<PurchaseRequest[]> {
  const rows = await prisma.purchaseRequest.findMany({
    where: status ? { status } : undefined,
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapPurchaseRequestToDto);
}

export class PurchaseRequestNotFoundError extends Error {
  constructor() {
    super('Purchase request not found');
    this.name = 'PurchaseRequestNotFoundError';
  }
}

export class PurchaseRequestAlreadyPurchasedError extends Error {
  constructor() {
    super('This purchase request was already marked as purchased');
    this.name = 'PurchaseRequestAlreadyPurchasedError';
  }
}

/**
 * "اتشرت" — owner confirmed both effects happen together for a
 * `STOCK_SHORTFALL` row: the bought quantity is recorded as a real `IN`
 * stock movement (attributed to the acting staff member's current
 * branch, same convention `recordStockMovement` already uses), and the
 * real amount paid is booked as a `SupplierPurchase`. A `BOARDS_*` row
 * has no `InventoryItem` to restock at all — only the `SupplierPurchase`
 * booking happens, described by which step it covers (owner: "المفروض
 * هيتحط في حساب المورد سعر التركيب... وهيكون ظاهرلي عند المورد إنه عنده
 * الطلب كذا"). Either way, booking is skipped if no supplier was ever
 * assigned — the row still moves to PURCHASED so it drops off the queue.
 */
export async function markPurchaseRequestPurchased(
  id: string,
  input: MarkPurchaseRequestPurchasedInput,
  branchId: string,
  staffId: string,
): Promise<PurchaseRequest> {
  const existing = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { inventoryItem: { select: { name: true } }, boardsCatalogItem: { select: { name: true } }, order: { select: { invoiceNumber: true } } },
  });
  if (!existing) throw new PurchaseRequestNotFoundError();
  if (existing.status === 'PURCHASED') throw new PurchaseRequestAlreadyPurchasedError();

  const isStockShortfall = existing.kind === 'STOCK_SHORTFALL';
  const purchasedQuantity = isStockShortfall ? (input.purchasedQuantity ?? 0) : null;

  const updated = await prisma.$transaction(async (tx) => {
    if (isStockShortfall && existing.inventoryItemId && purchasedQuantity) {
      await tx.stockMovement.create({
        data: { inventoryItemId: existing.inventoryItemId, branchId, type: 'IN', quantity: purchasedQuantity, reference: 'شراء عاجل' },
      });
      await tx.stockLevel.upsert({
        where: { inventoryItemId_branchId: { inventoryItemId: existing.inventoryItemId, branchId } },
        create: { inventoryItemId: existing.inventoryItemId, branchId, quantityOnHand: purchasedQuantity },
        update: { quantityOnHand: { increment: purchasedQuantity } },
      });
    }

    if (existing.supplierId) {
      const itemName = existing.inventoryItem?.name ?? existing.boardsCatalogItem?.name ?? '';
      const description =
        existing.kind === 'BOARDS_ASSEMBLY'
          ? `تركيب/تجميع ${itemName} — طلب ${existing.order.invoiceNumber}`
          : existing.kind === 'BOARDS_PURCHASE'
            ? `شراء ${itemName} — طلب ${existing.order.invoiceNumber}`
            : 'شراء عاجل — تغطية نقص مخزون';
      await tx.supplierPurchase.create({
        data: { partnerId: existing.supplierId, amount: input.purchasedAmount, description, date: new Date(), recordedById: staffId },
      });
    }

    return tx.purchaseRequest.update({
      where: { id },
      data: {
        status: 'PURCHASED',
        purchasedQuantity,
        purchasedAmount: input.purchasedAmount,
        purchasedAt: new Date(),
        purchasedById: staffId,
      },
      include: INCLUDE,
    });
  });

  return mapPurchaseRequestToDto(updated);
}

/**
 * The `STOCK_SHORTFALL` auto-trigger (owner: "الشراء العاجل لما يكون تبع
 * طلب من الطلبات") — called from `orderService.ts` right after each
 * `deductStockForOrderItem` inside the SAME transaction. Checks the
 * item's real company-wide balance (summed across every branch's
 * `StockLevel`, matching `isLowStock`'s own "one unified warehouse"
 * convention — never a single branch's row) and, only when it went
 * negative, upserts one PENDING request per item: updates the existing
 * PENDING row's `quantityNeeded` to the fresh deficit if one is already
 * open (self-correcting — no duplicate-row spam across several orders
 * depleting the same item before anyone buys it), or creates a brand new
 * one tied to this order. Never blocks/throws — same "never blocks order
 * creation" discipline `deductStockForOrderItem` itself already follows.
 */
export async function maybeCreatePurchaseRequest(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
  orderId: string,
  orderItemId: string,
): Promise<void> {
  const levels = await tx.stockLevel.findMany({ where: { inventoryItemId }, select: { quantityOnHand: true } });
  const totalOnHand = levels.reduce((sum, l) => sum + l.quantityOnHand.toNumber(), 0);
  if (totalOnHand >= 0) return;
  const quantityNeeded = -totalOnHand;

  const existingPending = await tx.purchaseRequest.findFirst({
    where: { inventoryItemId, kind: 'STOCK_SHORTFALL', status: 'PENDING' },
    select: { id: true },
  });
  if (existingPending) {
    await tx.purchaseRequest.update({ where: { id: existingPending.id }, data: { quantityNeeded } });
    return;
  }

  const item = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId }, select: { supplierId: true } });
  await tx.purchaseRequest.create({
    data: {
      kind: 'STOCK_SHORTFALL',
      inventoryItemId,
      supplierId: item?.supplierId ?? null,
      orderId,
      orderItemId,
      quantityNeeded,
    },
  });
}

/**
 * The `BOARDS_*` auto-trigger (owner: "الروول أب... لما نطلب الاوردر
 * يتحط في قائمة شراء عاجل... دائمًا بالطلب") — called from
 * `orderService.ts` right after an `OrderItem` referencing a
 * `BoardsCatalogItem` is created. Unlike the stock-shortfall trigger,
 * this never checks anything first and never merges into an existing
 * PENDING row — a flat-priced catalog item has no stock concept at all
 * ("بالطلب" — always bought fresh per order), so every order creates two
 * brand-new rows unconditionally: one to buy the physical item, one to
 * pay for assembly/mounting — two different suppliers, two different
 * amounts, confirmed separately by the owner.
 */
export async function createBoardsCatalogPurchaseRequests(
  tx: Prisma.TransactionClient,
  boardsCatalogItemId: string,
  orderId: string,
  orderItemId: string,
): Promise<void> {
  const item = await tx.boardsCatalogItem.findUnique({
    where: { id: boardsCatalogItemId },
    select: { purchaseSupplierId: true, assemblySupplierId: true },
  });
  if (!item) return;

  await tx.purchaseRequest.create({
    data: {
      kind: 'BOARDS_PURCHASE',
      boardsCatalogItemId,
      supplierId: item.purchaseSupplierId,
      orderId,
      orderItemId,
    },
  });
  await tx.purchaseRequest.create({
    data: {
      kind: 'BOARDS_ASSEMBLY',
      boardsCatalogItemId,
      supplierId: item.assemblySupplierId,
      orderId,
      orderItemId,
    },
  });
}
