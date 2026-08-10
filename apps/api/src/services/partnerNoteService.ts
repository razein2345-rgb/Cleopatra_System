import type { Prisma } from '../generated/prisma/client.js';
import type { PartnerNote } from '@cleopatra/shared';

type NoteRecord = Prisma.PartnerNoteGetPayload<object>;

/** Maps a Prisma PartnerNote row onto the shared PartnerNote API shape. */
export function mapNoteToDto(note: NoteRecord): PartnerNote {
  return {
    id: note.id,
    partnerId: note.partnerId,
    title: note.title,
    body: note.body,
    color: note.color,
    isPinned: note.isPinned,
    createdBy: note.createdBy,
    updatedBy: note.updatedBy,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * Canonical note ordering: Pinned first, then newest first — "newest"
 * read as most-recently-created (a running log reads chronologically by
 * entry, not by last edit), matching the explicit M5 requirement
 * "Pinned notes always appear first. Then newest first."
 */
export const NOTE_ORDER_BY: Prisma.PartnerNoteOrderByWithRelationInput[] = [
  { isPinned: 'desc' },
  { createdAt: 'desc' },
];
