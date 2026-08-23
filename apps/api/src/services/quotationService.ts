import type { Prisma } from '../generated/prisma/client.js';
import type { CreateQuotationItemInput, Quotation, QuotationItem, QuotationStatus } from '@cleopatra/shared';
import { resolveRequiredQuantity } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { buildPricingContext, computeItemPricing } from './pricingEngineService.js';
import { getPublicAttachmentUrl } from './attachmentService.js';
import { assertItemDiscountsValid, assertPartnerPresentUnlessWalkIn, ItemDiscountExceedsTotalError, PartnerRequiredError, sumItemDiscounts } from './orderService.js';

export { ItemDiscountExceedsTotalError, PartnerRequiredError };

/**
 * Centralized here (not duplicated per controller) — mirrors
 * `orderService.ts`'s `ORDER_INCLUDE` exactly.
 */
export const QUOTATION_INCLUDE = {
  items: true,
  nextVersion: { select: { id: true } },
} satisfies Prisma.QuotationInclude;

type QuotationRecord = Prisma.QuotationGetPayload<{ include: typeof QUOTATION_INCLUDE }>;
type QuotationItemRecord = Prisma.QuotationItemGetPayload<object>;

export function mapQuotationItemToDto(item: QuotationItemRecord): QuotationItem {
  return {
    id: item.id,
    quotationId: item.quotationId,
    itemType: item.itemType,
    notes: item.notes,
    description: item.description,
    readyProductId: item.readyProductId,
    serviceId: item.serviceId,
    kind: item.kind,
    modelName: item.modelName,
    breakdown: item.breakdown,
    itemTotal: item.itemTotal?.toNumber() ?? null,
    sizeFamilyKey: item.sizeFamilyKey,
    realSizeLabel: item.realSizeLabel,
    productionTrack: item.productionTrack,
    groupId: item.groupId,
    requiredQuantity: item.requiredQuantity,
    discountAmount: item.discountAmount.toNumber(),
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — the Quotation-side
 * mirror of `orderService.ts`'s `resolveOrderItemGroups` (same "a group of
 * one item isn't meaningful" rule).
 */
export async function resolveQuotationItemGroups(
  tx: Prisma.TransactionClient,
  quotationId: string,
  items: { groupKey?: string }[],
): Promise<Map<string, string>> {
  const keyCounts = new Map<string, number>();
  for (const item of items) {
    if (!item.groupKey) continue;
    keyCounts.set(item.groupKey, (keyCounts.get(item.groupKey) ?? 0) + 1);
  }

  const groupKeyToId = new Map<string, string>();
  for (const [key, count] of keyCounts) {
    if (count < 2) continue;
    const group = await tx.quotationItemGroup.create({ data: { quotationId } });
    groupKeyToId.set(key, group.id);
  }
  return groupKeyToId;
}

/**
 * `canSeeInternal` is an explicit capability input, not derived from
 * `req.auth` inside this function — per the "Future Portal Compatibility"
 * architectural decision, a future Customer Portal/mobile caller computes
 * this differently (e.g. always `false`) and calls this exact same
 * function, rather than a rewritten or duplicated mapper.
 */
export function mapQuotationToDto(quotation: QuotationRecord, canSeeInternal: boolean): Quotation {
  return {
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    branchId: quotation.branchId,
    partnerId: quotation.partnerId,
    staffId: quotation.staffId,
    date: quotation.date.toISOString(),
    validUntil: quotation.validUntil ? quotation.validUntil.toISOString() : null,
    subtotal: quotation.subtotal.toNumber(),
    discountPercent: quotation.discountPercent.toNumber(),
    vatOn: quotation.vatOn,
    vatAmount: quotation.vatAmount.toNumber(),
    finalTotal: quotation.finalTotal.toNumber(),
    status: quotation.status,
    customerNotes: quotation.customerNotes,
    internalNotes: canSeeInternal ? quotation.internalNotes : null,
    approvalState: quotation.approvalState,
    version: quotation.version,
    previousVersionId: quotation.previousVersionId,
    nextVersionExists: quotation.nextVersion !== null,
    convertedOrderId: quotation.convertedOrderId,
    printCount: quotation.printCount,
    items: quotation.items.map(mapQuotationItemToDto),
    itemDiscountsTotal: quotation.items.reduce((sum, item) => sum + item.discountAmount.toNumber(), 0),
    createdAt: quotation.createdAt.toISOString(),
    updatedAt: quotation.updatedAt.toISOString(),
  };
}

/**
 * Legal status transitions — the only place this project decides what
 * status a Quotation may move to next. No route/controller/UI code
 * duplicates this table (VISION.md's Workflow Engine Architecture /
 * the "Workflow Ready" architectural decision) — everything calls
 * `assertLegalStatusTransition` instead. Moving this behind a real
 * Workflow Engine later is a change to this one function, not an
 * API-contract or UI change.
 */
const LEGAL_STATUS_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
  ACCEPTED: ['CONVERTED'],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED: [],
};

/**
 * Owner (2026-08-17, "تتبع العدد بس، من غير منع") — increments the
 * visibility-only print counter. Never throws/blocks on any count; the
 * whole point is this can never stop someone from printing.
 */
export async function recordQuotationPrint(id: string): Promise<QuotationRecord> {
  return prisma.quotation.update({
    where: { id },
    data: { printCount: { increment: 1 } },
    include: QUOTATION_INCLUDE,
  });
}

export class IllegalStatusTransitionError extends Error {
  constructor(from: QuotationStatus, to: QuotationStatus) {
    super(`Cannot move a Quotation from ${from} to ${to}`);
    this.name = 'IllegalStatusTransitionError';
  }
}

export function assertLegalStatusTransition(from: QuotationStatus, to: QuotationStatus): void {
  if (!LEGAL_STATUS_TRANSITIONS[from].includes(to)) {
    throw new IllegalStatusTransitionError(from, to);
  }
}

/**
 * Atomically reserves the next quotation number for a year, reusing the
 * existing `DocumentSequence` model (Phase 1) exactly as its own doc
 * comment intends: "incremented atomically in the same transaction that
 * creates the document."
 *
 * FEATURE-007 (2026-08-12, bug fix) — `Quotation.quotationNumber` is
 * *globally* unique, not unique-per-branch; always reserving against the
 * default branch's sequence row (regardless of which branch is actually
 * creating the quotation) keeps this a single shared global counter per
 * year, matching that constraint — see `nextInvoiceNumber`'s doc comment
 * in `orderService.ts` for the full incident this fixes.
 */
export async function nextQuotationNumber(tx: Prisma.TransactionClient): Promise<string> {
  const defaultBranch = await tx.branch.findFirstOrThrow({ where: { isDefault: true }, select: { id: true } });
  const year = new Date().getFullYear();
  const sequence = await tx.documentSequence.upsert({
    where: { branchId_documentType_year: { branchId: defaultBranch.id, documentType: 'QUOTATION', year } },
    create: { branchId: defaultBranch.id, documentType: 'QUOTATION', year, prefix: 'CLP-QUO', lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${sequence.prefix}-${year}-${String(sequence.lastNumber).padStart(6, '0')}`;
}

export class QuotationItemValidationError extends Error {}

/**
 * Confirms each item's catalog reference (if any) actually exists and
 * isn't soft-deleted, and that a reference-less item carries a
 * description. Run in the controller before the create/update
 * transaction (matching this project's established pattern of
 * pre-transaction validation in the controller, not inside the
 * transaction) — see contactPersons.ts/partnerAddresses.ts for the same
 * shape.
 */
export async function validateQuotationItemRefs(
  items: Array<{
    readyProductId?: string;
    serviceId?: string;
    description?: string;
  }>,
): Promise<void> {
  for (const item of items) {
    if (item.readyProductId && item.serviceId) {
      throw new QuotationItemValidationError(
        'An item may reference at most one of readyProductId/serviceId',
      );
    }
    if (item.readyProductId) {
      const product = await prisma.readyProduct.findUnique({ where: { id: item.readyProductId } });
      if (!product || product.isDeleted) {
        throw new QuotationItemValidationError('Referenced ready product not found');
      }
    }
    if (item.serviceId) {
      const service = await prisma.service.findUnique({ where: { id: item.serviceId } });
      if (!service || service.isDeleted) {
        throw new QuotationItemValidationError('Referenced service not found');
      }
    }
    if (!item.readyProductId && !item.serviceId && !item.description) {
      throw new QuotationItemValidationError(
        'An item with no product/service reference requires a description',
      );
    }
  }
}

/**
 * FEATURE-007 — Quotation creation wired to the exact same Pricing Engine
 * as Order (owner's explicit clarification, 2026-08-10, that Quotation
 * creation is not a separate/lesser flow — it's the same unified creation
 * screen saving as a different document type). `subtotal`/`vatAmount`/
 * `finalTotal` are computed here, never accepted from the caller, mirroring
 * `createOrder`'s own doc comment.
 */
export async function createQuotation(
  input: {
    partnerId?: string | null;
    branchId: string;
    staffId: string;
    validUntil?: string;
    discountPercent?: number;
    vatOn?: boolean;
    customerNotes?: string;
    internalNotes?: string;
    items: CreateQuotationItemInput[];
  },
  itemNames: Map<string, string>,
): Promise<QuotationRecord> {
  assertPartnerPresentUnlessWalkIn(input.partnerId, input.items);
  const ctx = await buildPricingContext(input.items);
  const priced = input.items.map((item) => computeItemPricing(item, ctx));

  // FEATURE-007 — same reference-image resolution as createOrder (see its
  // doc comment) — never trust a client-supplied URL string.
  const attachmentIds = [...new Set(input.items.map((i) => i.attachmentId).filter((id): id is string => Boolean(id)))];
  const attachmentUrlById = new Map(
    attachmentIds.length
      ? (await prisma.attachment.findMany({ where: { id: { in: attachmentIds } }, select: { id: true, storagePath: true } }))
          .filter((a) => a.storagePath)
          .map((a) => [a.id, getPublicAttachmentUrl(a.storagePath!)] as const)
      : [],
  );

  assertItemDiscountsValid(input.items, priced);
  const subtotal = priced.reduce((sum, p) => sum + p.total, 0);
  const itemDiscountsTotal = sumItemDiscounts(input.items);
  const discountPercent = input.discountPercent ?? 0;
  const afterDiscount = (subtotal - itemDiscountsTotal) * (1 - discountPercent / 100);
  const vatOn = input.vatOn ?? false;
  const vatAmount = vatOn ? afterDiscount * (ctx.vatRate / 100) : 0;
  // Owner, 2026-08-12: round the final charged amount up — see orderService.ts's matching comment.
  const finalTotal = Math.ceil(afterDiscount + vatAmount);

  return prisma.$transaction(async (tx) => {
    const quotationNumber = await nextQuotationNumber(tx);
    // "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — created without its
    // items first (unlike before) so `resolveQuotationItemGroups` has a
    // real `quotationId` to attach group rows to before any item references
    // one; items are attached in a second `update` call right below.
    const created = await tx.quotation.create({
      data: {
        quotationNumber,
        branchId: input.branchId,
        partnerId: input.partnerId ?? null,
        staffId: input.staffId,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        subtotal,
        discountPercent,
        vatOn,
        vatAmount,
        finalTotal,
        customerNotes: input.customerNotes ?? null,
        internalNotes: input.internalNotes ?? null,
      },
      select: { id: true },
    });

    const groupKeyToId = await resolveQuotationItemGroups(tx, created.id, input.items);

    const withItems = await tx.quotation.update({
      where: { id: created.id },
      data: {
        items: {
          create: input.items.map((item, index) => {
            const result = priced[index]!;
            const readyProductName = item.readyProductId ? (itemNames.get(item.readyProductId) ?? null) : null;
            const serviceName = item.serviceId ? (itemNames.get(item.serviceId) ?? null) : null;
            return {
              itemType: item.itemType,
              notes: item.notes ?? null,
              description: item.description ?? null,
              readyProductId: item.readyProductId ?? null,
              serviceId: item.serviceId ?? null,
              kind: item.itemType,
              modelName: readyProductName ?? serviceName,
              breakdown: {
                ...(result.breakdown as Record<string, unknown>),
                referenceImageUrl: item.attachmentId ? (attachmentUrlById.get(item.attachmentId) ?? null) : null,
              },
              itemTotal: result.total,
              sizeFamilyKey: result.sizeFamilyKey,
              realSizeLabel: result.realSizeLabel,
              productionTrack: item.productionTrack ?? null,
              groupId: item.groupKey ? (groupKeyToId.get(item.groupKey) ?? null) : null,
              requiredQuantity: resolveRequiredQuantity(item.pricing),
              discountAmount: item.discountAmount ?? 0,
            };
          }),
        },
      },
      include: QUOTATION_INCLUDE,
    });

    if (attachmentIds.length) {
      await tx.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { quotationId: created.id } });
    }

    return withItems;
  });
}
