import { Prisma } from '../generated/prisma/client.js';
import type {
  CreateCutoverInput,
  CreateInventoryOpeningInput,
  CreateTreasuryOpeningInput,
  CutoverRecord,
  InventoryOpening,
  TreasuryOpening,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { movementDelta } from './inventoryService.js';
import { isAdminOrAbove } from './authContext.js';

/**
 * Opening State / Cutover (Phase 3C.2) — the Cutover lifecycle, and the
 * two branch-scoped opening tables (TreasuryOpening/InventoryOpening) that
 * are children of it. CustomerOpening/SupplierOpening (company-wide,
 * standalone) live in `openingStateService.ts` instead.
 *
 * Follows this codebase's own consistent style throughout: one named
 * function per action (never a generic status-mutation endpoint), typed
 * errors per failure mode (mirroring `DayAlreadyClosedError`/
 * `ManualEntryOnlyError`), and every mutation wrapped in exactly the
 * `prisma.$transaction` shape `orderService.ts`/`treasuryService.ts`
 * already use.
 */

export class CutoverNotFoundError extends Error {
  constructor() {
    super('Cutover not found');
    this.name = 'CutoverNotFoundError';
  }
}

export class InvalidCutoverDatesError extends Error {
  constructor() {
    super('goLiveDate must be strictly after lastManualDate');
    this.name = 'InvalidCutoverDatesError';
  }
}

/** Thrown when the partial unique index (`branchId` WHERE `isSuperseded = false`) is hit — a non-superseded cutover already exists for this branch. */
export class ActiveCutoverExistsError extends Error {
  constructor() {
    super('This branch already has a non-superseded cutover');
    this.name = 'ActiveCutoverExistsError';
  }
}

/**
 * Owner decision (2026-09-25, found while testing the UI) — a superseded
 * cutover is dead (activate, reopen and supersede-again all reject it): it was cancelled to free the branch's slot for a new one.
 * Activating it anyway would still post its inventory openings (real
 * StockMovement/StockLevel writes) on a branch with live customers and
 * orders, while the `isSuperseded = false` lookups would never treat it as
 * the branch's active cutover. Arabic message: new error, surfaced as-is.
 */
export class CutoverSupersededError extends Error {
  constructor() {
    super('هذا الـ Cutover أُلغي نهائيًا — لا يمكن تفعيله أو إعادة فتحه أو إلغاؤه مرة أخرى. أنشئ Cutover جديدًا للفرع بدلًا منه.');
    this.name = 'CutoverSupersededError';
  }
}

export class InvalidCutoverTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot move a cutover from ${from} to ${to}`);
    this.name = 'InvalidCutoverTransitionError';
  }
}

/** Maker-checker: the creator of a DRAFT/REVIEW cutover cannot approve their own submission unless they are ADMIN/SUPER_ADMIN. */
export class CutoverApprovalNotAllowedError extends Error {
  constructor() {
    super('You cannot approve a cutover you created yourself');
    this.name = 'CutoverApprovalNotAllowedError';
  }
}

/**
 * Cutover-revision-round decision (post-3D) — the minimum-approver-role
 * gate now also applies to the 4 "verify a line is physically checked"
 * actions (Treasury/Inventory/Customer/SupplierOpening), since VERIFIED
 * is the precondition for approval — the same class of gap as
 * `assertCanApprove` originally had before it required ADMIN+.
 */
export class VerificationNotAllowedError extends Error {
  constructor() {
    super('Only ADMIN or SUPER_ADMIN may verify an opening line');
    this.name = 'VerificationNotAllowedError';
  }
}

export class CutoverActivationNotAllowedError extends Error {
  constructor() {
    super('Only a Super Admin may activate a cutover');
    this.name = 'CutoverActivationNotAllowedError';
  }
}

export class CutoverSupersedeNotAllowedError extends Error {
  constructor() {
    super('Only a Super Admin may supersede a cutover');
    this.name = 'CutoverSupersedeNotAllowedError';
  }
}

export class CutoverNotReadyForSubmissionError extends Error {
  constructor() {
    super('A cutover needs at least one opening line before it can be submitted for review');
    this.name = 'CutoverNotReadyForSubmissionError';
  }
}

export class CutoverNotReadyForApprovalError extends Error {
  constructor() {
    super('Every opening line must be verified before a cutover can be approved');
    this.name = 'CutoverNotReadyForApprovalError';
  }
}

export class TreasuryOpeningNotFoundError extends Error {
  constructor() {
    super('Treasury opening line not found');
    this.name = 'TreasuryOpeningNotFoundError';
  }
}

export class InventoryOpeningNotFoundError extends Error {
  constructor() {
    super('Inventory opening line not found');
    this.name = 'InventoryOpeningNotFoundError';
  }
}

export class CutoverNotEditableError extends Error {
  constructor() {
    super('This cutover is no longer in DRAFT — reopen it before editing its opening lines');
    this.name = 'CutoverNotEditableError';
  }
}

function toCutoverDto(record: Prisma.CutoverRecordGetPayload<object>): CutoverRecord {
  return {
    id: record.id,
    branchId: record.branchId,
    lastManualDate: record.lastManualDate.toISOString().slice(0, 10),
    goLiveDate: record.goLiveDate.toISOString().slice(0, 10),
    status: record.status,
    isSuperseded: record.isSuperseded,
    supersededById: record.supersededById,
    supersededAt: record.supersededAt?.toISOString() ?? null,
    supersededReason: record.supersededReason,
    createdById: record.createdById,
    reviewedById: record.reviewedById,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    approvedById: record.approvedById,
    approvedAt: record.approvedAt?.toISOString() ?? null,
    activatedById: record.activatedById,
    activatedAt: record.activatedAt?.toISOString() ?? null,
    reopenedById: record.reopenedById,
    reopenedAt: record.reopenedAt?.toISOString() ?? null,
    reopenReason: record.reopenReason,
    notes: record.notes,
    selfApprovedException: record.selfApprovedException,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toTreasuryOpeningDto(r: Prisma.TreasuryOpeningGetPayload<object>): TreasuryOpening {
  return {
    id: r.id,
    cutoverId: r.cutoverId,
    method: r.method,
    amount: r.amount.toNumber(),
    verificationStatus: r.verificationStatus,
    notes: r.notes,
    enteredById: r.enteredById,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toInventoryOpeningDto(r: Prisma.InventoryOpeningGetPayload<object>): InventoryOpening {
  return {
    id: r.id,
    cutoverId: r.cutoverId,
    inventoryItemId: r.inventoryItemId,
    quantity: r.quantity.toNumber(),
    unitCostAtOpening: r.unitCostAtOpening?.toNumber() ?? null,
    verificationStatus: r.verificationStatus,
    notes: r.notes,
    enteredById: r.enteredById,
    activatedAt: r.activatedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function getCutover(id: string): Promise<CutoverRecord> {
  const record = await prisma.cutoverRecord.findUnique({ where: { id } });
  if (!record) throw new CutoverNotFoundError();
  return toCutoverDto(record);
}

export async function listCutovers(branchIds?: string[]): Promise<CutoverRecord[]> {
  const records = await prisma.cutoverRecord.findMany({
    where: branchIds ? { branchId: { in: branchIds } } : {},
    orderBy: { createdAt: 'desc' },
  });
  return records.map(toCutoverDto);
}

export async function listTreasuryOpenings(cutoverId: string): Promise<TreasuryOpening[]> {
  const rows = await prisma.treasuryOpening.findMany({ where: { cutoverId } });
  return rows.map(toTreasuryOpeningDto);
}

export async function listInventoryOpenings(cutoverId: string): Promise<InventoryOpening[]> {
  const rows = await prisma.inventoryOpening.findMany({ where: { cutoverId } });
  return rows.map(toInventoryOpeningDto);
}

export async function createCutover(input: CreateCutoverInput, staffId: string): Promise<CutoverRecord> {
  const lastManualDate = new Date(input.lastManualDate);
  const goLiveDate = new Date(input.goLiveDate);
  if (!(goLiveDate.getTime() > lastManualDate.getTime())) throw new InvalidCutoverDatesError();

  try {
    const created = await prisma.cutoverRecord.create({
      data: {
        branchId: input.branchId,
        lastManualDate,
        goLiveDate,
        notes: input.notes ?? null,
        createdById: staffId,
      },
    });
    return toCutoverDto(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ActiveCutoverExistsError();
    }
    throw err;
  }
}

export async function submitCutoverForReview(cutoverId: string, staffId: string): Promise<CutoverRecord> {
  const cutover = await prisma.cutoverRecord.findUnique({ where: { id: cutoverId } });
  if (!cutover) throw new CutoverNotFoundError();
  if (cutover.status !== 'DRAFT') throw new InvalidCutoverTransitionError(cutover.status, 'REVIEW');

  const [treasuryCount, inventoryCount] = await Promise.all([
    prisma.treasuryOpening.count({ where: { cutoverId } }),
    prisma.inventoryOpening.count({ where: { cutoverId } }),
  ]);
  if (treasuryCount + inventoryCount === 0) throw new CutoverNotReadyForSubmissionError();

  const updated = await prisma.cutoverRecord.update({
    where: { id: cutoverId },
    data: { status: 'REVIEW', reviewedById: staffId, reviewedAt: new Date() },
  });
  return toCutoverDto(updated);
}

/**
 * Maker-checker (cutover-revision-round decision, post-3D) — TWO
 * independent rules, both new/tightened versus the original Phase 3C.1
 * design:
 *
 * 1. Minimum approver role: the approver (the "checker") must be ADMIN or
 *    SUPER_ADMIN, full stop — previously ANY authenticated staff member
 *    could approve someone ELSE's record (only self-approval was ever
 *    gated). The owner explicitly declined adding a new SUPERVISOR role
 *    for this (would need a `prisma db seed` run); ADMIN is the agreed
 *    floor using roles that already exist.
 * 2. Self-approval is now disallowed for EVERY role, including ADMIN —
 *    stricter than the original design (which let ADMIN/SUPER_ADMIN
 *    self-approve silently). The ONLY remaining path is a SUPER_ADMIN
 *    explicit emergency exception, surfaced via this function's return
 *    value rather than allowed silently: the caller MUST persist the
 *    result as `selfApprovedException` on the record (true when this
 *    call actually was a self-approval, false otherwise — a later
 *    NORMAL, non-self approval after a reopen correctly clears a
 *    previous exception flag).
 *
 * Reused verbatim by CustomerOpening/SupplierOpening approval in
 * openingStateService.ts.
 */
export function assertCanApprove(createdById: string, staffId: string, roleNames: string[]): boolean {
  if (!isAdminOrAbove(roleNames)) throw new CutoverApprovalNotAllowedError();

  const isSelf = createdById === staffId;
  if (!isSelf) return false;
  if (roleNames.includes('SUPER_ADMIN')) return true;
  throw new CutoverApprovalNotAllowedError();
}

export async function approveCutover(cutoverId: string, staffId: string, roleNames: string[]): Promise<CutoverRecord> {
  const cutover = await prisma.cutoverRecord.findUnique({ where: { id: cutoverId } });
  if (!cutover) throw new CutoverNotFoundError();
  if (cutover.status !== 'REVIEW') throw new InvalidCutoverTransitionError(cutover.status, 'APPROVED');
  const selfApprovedException = assertCanApprove(cutover.createdById, staffId, roleNames);

  const [unverifiedTreasury, unverifiedInventory] = await Promise.all([
    prisma.treasuryOpening.count({ where: { cutoverId, verificationStatus: 'UNVERIFIED' } }),
    prisma.inventoryOpening.count({ where: { cutoverId, verificationStatus: 'UNVERIFIED' } }),
  ]);
  if (unverifiedTreasury + unverifiedInventory > 0) throw new CutoverNotReadyForApprovalError();

  const updated = await prisma.cutoverRecord.update({
    where: { id: cutoverId },
    data: { status: 'APPROVED', approvedById: staffId, approvedAt: new Date(), selfApprovedException },
  });
  return toCutoverDto(updated);
}

/**
 * The reporting/inventory boundary switch. Every InventoryOpening write,
 * every StockMovement/StockLevel write, and the CutoverRecord's own
 * status flip happen inside ONE transaction — all-or-nothing, matching
 * `orderService.createOrder`'s own multi-table atomic-transaction shape.
 * An InventoryOpening whose physically-counted quantity exactly matches
 * current StockLevel gets NO StockMovement (Phase 3C.1 decision) — only
 * `activatedAt` is set, which is why `activatedAt` (not
 * `StockMovement.inventoryOpeningId`) is the authoritative "was this
 * processed" signal checked below.
 */
export async function activateCutover(cutoverId: string, staffId: string, roleNames: string[]): Promise<CutoverRecord> {
  if (!roleNames.includes('SUPER_ADMIN')) throw new CutoverActivationNotAllowedError();

  const cutover = await prisma.cutoverRecord.findUnique({ where: { id: cutoverId } });
  if (!cutover) throw new CutoverNotFoundError();
  if (cutover.isSuperseded) throw new CutoverSupersededError();
  if (cutover.status !== 'APPROVED') throw new InvalidCutoverTransitionError(cutover.status, 'ACTIVE');

  const updated = await prisma.$transaction(async (tx) => {
    const openings = await tx.inventoryOpening.findMany({ where: { cutoverId, activatedAt: null } });

    for (const opening of openings) {
      const level = await tx.stockLevel.findUnique({
        where: { inventoryItemId_branchId: { inventoryItemId: opening.inventoryItemId, branchId: cutover.branchId } },
      });
      const current = level?.quantityOnHand.toNumber() ?? 0;
      const target = opening.quantity.toNumber();
      const diff = target - current;

      if (diff !== 0) {
        const type = diff > 0 ? 'IN' : 'OUT';
        const quantity = Math.abs(diff);
        await tx.stockMovement.create({
          data: {
            inventoryItemId: opening.inventoryItemId,
            branchId: cutover.branchId,
            type,
            quantity,
            reference: 'Opening State — Cutover reconciliation',
            inventoryOpeningId: opening.id,
          },
        });
        await tx.stockLevel.upsert({
          where: { inventoryItemId_branchId: { inventoryItemId: opening.inventoryItemId, branchId: cutover.branchId } },
          create: { inventoryItemId: opening.inventoryItemId, branchId: cutover.branchId, quantityOnHand: target },
          update: { quantityOnHand: { increment: movementDelta(type, quantity) } },
        });
      }

      await tx.inventoryOpening.update({ where: { id: opening.id }, data: { activatedAt: new Date() } });
    }

    return tx.cutoverRecord.update({
      where: { id: cutoverId },
      data: { status: 'ACTIVE', activatedById: staffId, activatedAt: new Date() },
    });
  });

  return toCutoverDto(updated);
}

/** Reopen — corrects the SAME row in place (never a new version), matching TreasuryDayClosure/PayrollPeriod's exact precedent. `isSuperseded` is deliberately untouched — reopen is not supersede. */
export async function reopenCutover(cutoverId: string, staffId: string, roleNames: string[], reason: string): Promise<CutoverRecord> {
  const cutover = await prisma.cutoverRecord.findUnique({ where: { id: cutoverId } });
  if (!cutover) throw new CutoverNotFoundError();
  if (cutover.isSuperseded) throw new CutoverSupersededError();
  if (cutover.status !== 'APPROVED' && cutover.status !== 'ACTIVE') {
    throw new InvalidCutoverTransitionError(cutover.status, 'DRAFT');
  }
  // Phase 3C.1 §7 — reopening an ACTIVE cutover is stricter than reopening an APPROVED one.
  if (cutover.status === 'ACTIVE') {
    if (!roleNames.includes('SUPER_ADMIN')) throw new CutoverActivationNotAllowedError();
  } else if (!roleNames.includes('ADMIN') && !roleNames.includes('SUPER_ADMIN')) {
    throw new CutoverApprovalNotAllowedError();
  }

  const updated = await prisma.cutoverRecord.update({
    where: { id: cutoverId },
    data: { status: 'DRAFT', reopenedById: staffId, reopenedAt: new Date(), reopenReason: reason },
  });
  return toCutoverDto(updated);
}

/** Supersede — SUPER_ADMIN only, independent of Reopen. Frees the branch's partial-unique slot for a genuinely new future cutover. There is no `successorCutoverId` — deliberately, per the locked schema. */
export async function supersedeCutover(cutoverId: string, staffId: string, roleNames: string[], reason: string): Promise<CutoverRecord> {
  if (!roleNames.includes('SUPER_ADMIN')) throw new CutoverSupersedeNotAllowedError();

  const cutover = await prisma.cutoverRecord.findUnique({ where: { id: cutoverId } });
  if (!cutover) throw new CutoverNotFoundError();
  // Superseding twice would overwrite who/when/why of the first cancellation.
  if (cutover.isSuperseded) throw new CutoverSupersededError();

  const updated = await prisma.cutoverRecord.update({
    where: { id: cutoverId },
    data: { isSuperseded: true, supersededById: staffId, supersededAt: new Date(), supersededReason: reason },
  });
  return toCutoverDto(updated);
}

export async function upsertTreasuryOpening(cutoverId: string, input: CreateTreasuryOpeningInput, staffId: string): Promise<TreasuryOpening> {
  const cutover = await prisma.cutoverRecord.findUnique({ where: { id: cutoverId } });
  if (!cutover) throw new CutoverNotFoundError();
  if (cutover.status !== 'DRAFT') throw new CutoverNotEditableError();

  const row = await prisma.treasuryOpening.upsert({
    where: { cutoverId_method: { cutoverId, method: input.method } },
    create: { cutoverId, method: input.method, amount: input.amount, notes: input.notes ?? null, enteredById: staffId },
    update: { amount: input.amount, notes: input.notes ?? null, verificationStatus: 'UNVERIFIED' },
  });
  return toTreasuryOpeningDto(row);
}

/**
 * Phase 3D re-audit fix — lets the controller enforce the same branch
 * scoping on the verify-line action as every other Cutover mutation
 * (create/submit/approve/activate/reopen/supersede all go through
 * `loadAndCheckBranch`). This one is identified by the line's OWN id, not
 * the cutover's, so the branch has to be resolved via its parent first.
 */
export async function getTreasuryOpeningBranchId(id: string): Promise<string> {
  const row = await prisma.treasuryOpening.findUnique({ where: { id }, select: { cutover: { select: { branchId: true } } } });
  if (!row) throw new TreasuryOpeningNotFoundError();
  return row.cutover.branchId;
}

export async function setTreasuryOpeningVerification(id: string, verified: boolean, roleNames: string[]): Promise<TreasuryOpening> {
  if (!isAdminOrAbove(roleNames)) throw new VerificationNotAllowedError();
  const existing = await prisma.treasuryOpening.findUnique({ where: { id } });
  if (!existing) throw new TreasuryOpeningNotFoundError();
  const row = await prisma.treasuryOpening.update({
    where: { id },
    data: { verificationStatus: verified ? 'VERIFIED' : 'UNVERIFIED' },
  });
  return toTreasuryOpeningDto(row);
}

export async function upsertInventoryOpening(cutoverId: string, input: CreateInventoryOpeningInput, staffId: string): Promise<InventoryOpening> {
  const cutover = await prisma.cutoverRecord.findUnique({ where: { id: cutoverId } });
  if (!cutover) throw new CutoverNotFoundError();
  if (cutover.status !== 'DRAFT') throw new CutoverNotEditableError();

  const row = await prisma.inventoryOpening.upsert({
    where: { cutoverId_inventoryItemId: { cutoverId, inventoryItemId: input.inventoryItemId } },
    create: {
      cutoverId,
      inventoryItemId: input.inventoryItemId,
      quantity: input.quantity,
      unitCostAtOpening: input.unitCostAtOpening ?? null,
      notes: input.notes ?? null,
      enteredById: staffId,
    },
    update: {
      quantity: input.quantity,
      unitCostAtOpening: input.unitCostAtOpening ?? null,
      notes: input.notes ?? null,
      verificationStatus: 'UNVERIFIED',
    },
  });
  return toInventoryOpeningDto(row);
}

/** Same reasoning as getTreasuryOpeningBranchId above, for InventoryOpening. */
export async function getInventoryOpeningBranchId(id: string): Promise<string> {
  const row = await prisma.inventoryOpening.findUnique({ where: { id }, select: { cutover: { select: { branchId: true } } } });
  if (!row) throw new InventoryOpeningNotFoundError();
  return row.cutover.branchId;
}

export async function setInventoryOpeningVerification(id: string, verified: boolean, roleNames: string[]): Promise<InventoryOpening> {
  if (!isAdminOrAbove(roleNames)) throw new VerificationNotAllowedError();
  const existing = await prisma.inventoryOpening.findUnique({ where: { id } });
  if (!existing) throw new InventoryOpeningNotFoundError();
  const row = await prisma.inventoryOpening.update({
    where: { id },
    data: { verificationStatus: verified ? 'VERIFIED' : 'UNVERIFIED' },
  });
  return toInventoryOpeningDto(row);
}

/** Re-exported so a future report can determine "is this branch already live" per Phase 3A.1 §21. */
export async function getActiveCutoverForBranch(branchId: string): Promise<Prisma.CutoverRecordGetPayload<object> | null> {
  return prisma.cutoverRecord.findFirst({ where: { branchId, isSuperseded: false, status: 'ACTIVE' } });
}
