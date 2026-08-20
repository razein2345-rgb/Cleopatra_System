import type { Request, Response } from 'express';
import { createPartnerNoteSchema, setPartnerNotePinnedSchema, updatePartnerNoteSchema } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { mapNoteToDto, NOTE_ORDER_BY } from '../services/partnerNoteService.js';
import { loadPartnerOr404 } from '../services/partnerChildEntity.js';
import { recordAudit } from '../services/auditService.js';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';

async function loadNoteOr404(partnerId: string, noteId: string, res: Response) {
  const note = await prisma.partnerNote.findUnique({ where: { id: noteId } });
  if (!note || note.isDeleted || note.partnerId !== partnerId) {
    res.status(404).json({ success: false, error: { message: 'Note not found' } });
    return null;
  }
  return note;
}

/** Searching notes must search Title and Body (M5) — `?q=` on the list endpoint. */
export async function listPartnerNotes(req: Request<{ partnerId: string }>, res: Response) {
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;

  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const notes = await prisma.partnerNote.findMany({
    where: {
      partnerId: partner.id,
      isDeleted: false,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { body: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: NOTE_ORDER_BY,
  });
  res.json({ success: true, data: notes.map(mapNoteToDto) });
}

export async function createPartnerNote(req: Request<{ partnerId: string }>, res: Response) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }

  const input = createPartnerNoteSchema.parse(req.body);
  // PRODUCT_ROADMAP.md §2 — a new note is itself an act of contact, so
  // "آخر تواصل" advances automatically here (still hand-editable from the
  // Overview tab too — both paths write the same column, see
  // BusinessPartner.lastContactedAt's own schema comment). One
  // transaction so the two writes never partially apply.
  const [note] = await prisma.$transaction([
    prisma.partnerNote.create({
      data: { ...input, partnerId: partner.id, createdBy: auth.staffId },
    }),
    prisma.businessPartner.update({
      where: { id: partner.id },
      data: { lastContactedAt: new Date() },
    }),
  ]);

  await recordAudit({
    entityType: 'PartnerNote',
    entityId: note.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    newValue: { partnerId: partner.id, ...input },
  });

  res.status(201).json({ success: true, data: mapNoteToDto(note) });
}

/** Editing must preserve CreatedBy (M5) — only `updatedBy`/`updatedAt` change on edit. */
export async function updatePartnerNote(
  req: Request<{ partnerId: string; noteId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }
  const existing = await loadNoteOr404(partner.id, req.params.noteId, res);
  if (!existing) return;

  const input = updatePartnerNoteSchema.parse(req.body);
  const updated = await prisma.partnerNote.update({
    where: { id: existing.id },
    data: { ...input, updatedBy: auth.staffId },
  });

  await recordAudit({
    entityType: 'PartnerNote',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: { title: existing.title, body: existing.body, color: existing.color },
    newValue: input,
  });

  res.json({ success: true, data: mapNoteToDto(updated) });
}

/**
 * Only entry point that may change isPinned — not an "exactly one"
 * exclusivity flag (unlike ContactPerson.isPrimary/PartnerAddress.
 * isDefault), so no lock/transaction is needed: many notes may be pinned
 * at once. Records `PIN`/`UNPIN` distinctly from a generic content edit.
 */
export async function setPartnerNotePinned(
  req: Request<{ partnerId: string; noteId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }
  const existing = await loadNoteOr404(partner.id, req.params.noteId, res);
  if (!existing) return;

  const input = setPartnerNotePinnedSchema.parse(req.body);

  if (existing.isPinned === input.isPinned) {
    res.json({ success: true, data: mapNoteToDto(existing) });
    return;
  }

  const updated = await prisma.partnerNote.update({
    where: { id: existing.id },
    data: { isPinned: input.isPinned, updatedBy: auth.staffId },
  });

  await recordAudit({
    entityType: 'PartnerNote',
    entityId: updated.id,
    action: input.isPinned ? 'PIN' : 'UNPIN',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
    previousValue: { isPinned: existing.isPinned },
    newValue: { isPinned: input.isPinned },
  });

  res.json({ success: true, data: mapNoteToDto(updated) });
}

/** Soft delete only (ADR 0007) — never remove a note's history outright. */
export async function deletePartnerNote(
  req: Request<{ partnerId: string; noteId: string }>,
  res: Response,
) {
  const auth = req.auth!;
  const partner = await loadPartnerOr404(req.params.partnerId, res);
  if (!partner) return;
  if (!canAccessBranch(auth, partner.branchId)) {
    forbidBranch(res);
    return;
  }
  const existing = await loadNoteOr404(partner.id, req.params.noteId, res);
  if (!existing) return;

  const deleted = await prisma.partnerNote.update({
    where: { id: existing.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId },
    select: { id: true },
  });

  await recordAudit({
    entityType: 'PartnerNote',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: partner.branchId,
    partnerId: partner.id,
  });

  res.json({ success: true, data: { id: deleted.id } });
}
