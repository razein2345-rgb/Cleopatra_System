import type { Prisma } from '../generated/prisma/client.js';
import type { MarkPurchaseRequestPurchasedInput, PurchaseRequest, PurchaseRequestStatus } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

/**
 * "قائمة شراء عاجل" — part 2 of the supplier-linkage initiative (owner,
 * 2026-08-27: "الشراء العاجل لما يكون تبع طلب من الطلبات اللي العملا
 * طلبوها"). One row per real stock shortfall, created automatically by
 * `maybeCreatePurchaseRequest` below (called from `orderService.ts` right
 * after a stock deduction) — never a caller-composed create endpoint, so
 * there's no `createPurchaseRequest` here at all, only the auto-trigger
 * and the "mark purchased" completion step.
 */

const INCLUDE = {
  inventoryItem: { select: { name: true } },
  supplier: { select: { nameAr: true } },
  order: { select: { invoiceNumber: true } },
  purchasedBy: { select: { name: true } },
} satisfies Prisma.PurchaseRequestInclude;

type PurchaseRequestRecord = Prisma.PurchaseRequestGetPayload<{ include: typeof INCLUDE }>;

function mapPurchaseRequestToDto(row: PurchaseRequestRecord): PurchaseRequest {
  return {
    id: row.id,
    inventoryItemId: row.inventoryItemId,
    inventoryItemName: row.inventoryItem.name,
    supplierId: row.supplierId,
    supplierName: row.supplier?.nameAr ?? null,
    orderId: row.orderId,
    orderInvoiceNumber: row.order.invoiceNumber,
    orderItemId: row.orderItemId,
    quantityNeeded: row.quantityNeeded.toNumber(),
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
 * "اتشرت" — owner confirmed both effects happen together: the bought
 * quantity is recorded as a real `IN` stock movement (attributed to the
 * acting staff member's current branch, same convention `recordStockMovement`
 * already uses), and — only when a supplier was ever assigned — the real
 * amount paid is booked as a `SupplierPurchase` against them, so the
 * supplier's account statement (كشف حساب) picks it up automatically.
 */
export async function markPurchaseRequestPurchased(
  id: string,
  input: MarkPurchaseRequestPurchasedInput,
  branchId: string,
  staffId: string,
): Promise<PurchaseRequest> {
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!existing) throw new PurchaseRequestNotFoundError();
  if (existing.status === 'PURCHASED') throw new PurchaseRequestAlreadyPurchasedError();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.stockMovement.create({
      data: {
        inventoryItemId: existing.inventoryItemId,
        branchId,
        type: 'IN',
        quantity: input.purchasedQuantity,
        reference: 'شراء عاجل',
      },
    });
    await tx.stockLevel.upsert({
      where: { inventoryItemId_branchId: { inventoryItemId: existing.inventoryItemId, branchId } },
      create: { inventoryItemId: existing.inventoryItemId, branchId, quantityOnHand: input.purchasedQuantity },
      update: { quantityOnHand: { increment: input.purchasedQuantity } },
    });

    if (existing.supplierId) {
      await tx.supplierPurchase.create({
        data: {
          partnerId: existing.supplierId,
          amount: input.purchasedAmount,
          description: 'شراء عاجل — تغطية نقص مخزون',
          date: new Date(),
          recordedById: staffId,
        },
      });
    }

    return tx.purchaseRequest.update({
      where: { id },
      data: {
        status: 'PURCHASED',
        purchasedQuantity: input.purchasedQuantity,
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
 * The auto-trigger (owner: "الشراء العاجل لما يكون تبع طلب من الطلبات") —
 * called from `orderService.ts` right after each `deductStockForOrderItem`
 * inside the SAME transaction. Checks the item's real company-wide balance
 * (summed across every branch's `StockLevel`, matching `isLowStock`'s own
 * "one unified warehouse" convention — never a single branch's row) and,
 * only when it went negative, upserts one PENDING request per item:
 * updates the existing PENDING row's `quantityNeeded` to the fresh deficit
 * if one is already open (self-correcting — no duplicate-row spam across
 * several orders depleting the same item before anyone buys it), or
 * creates a brand new one tied to this order. Never blocks/throws — same
 * "never blocks order creation" discipline `deductStockForOrderItem`
 * itself already follows.
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
    where: { inventoryItemId, status: 'PENDING' },
    select: { id: true },
  });
  if (existingPending) {
    await tx.purchaseRequest.update({ where: { id: existingPending.id }, data: { quantityNeeded } });
    return;
  }

  const item = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId }, select: { supplierId: true } });
  await tx.purchaseRequest.create({
    data: {
      inventoryItemId,
      supplierId: item?.supplierId ?? null,
      orderId,
      orderItemId,
      quantityNeeded,
    },
  });
}
