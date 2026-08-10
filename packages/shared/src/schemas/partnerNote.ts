import { z } from 'zod';

const TITLE_MAX_LENGTH = 200;
const BODY_MAX_LENGTH = 10_000;

/** Loose 6-digit hex color, e.g. `#FBBF24` — free-form, not a fixed palette enum. */
const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex color, e.g. #FBBF24');

export const partnerNoteSchema = z.object({
  id: z.string().uuid(),
  partnerId: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  color: z.string().nullable(),
  isPinned: z.boolean(),
  createdBy: z.string().uuid(),
  updatedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `isPinned` is deliberately absent from create/update — same exclusion
 * pattern as `isPrimary`/`isDefault`/`isDefault`(category) elsewhere in
 * this feature. The only way to change it is the dedicated
 * `PUT .../notes/:noteId/pin` endpoint, which records `PIN`/`UNPIN`
 * distinctly from a generic content edit.
 */
export const createPartnerNoteSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
  body: z.string().trim().min(1).max(BODY_MAX_LENGTH),
  color: colorSchema.optional(),
});

export const updatePartnerNoteSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX_LENGTH).optional(),
  body: z.string().trim().min(1).max(BODY_MAX_LENGTH).optional(),
  color: colorSchema.nullable().optional(),
});

export const setPartnerNotePinnedSchema = z.object({
  isPinned: z.boolean(),
});

export type PartnerNote = z.infer<typeof partnerNoteSchema>;
export type CreatePartnerNoteInput = z.infer<typeof createPartnerNoteSchema>;
export type UpdatePartnerNoteInput = z.infer<typeof updatePartnerNoteSchema>;
export type SetPartnerNotePinnedInput = z.infer<typeof setPartnerNotePinnedSchema>;
