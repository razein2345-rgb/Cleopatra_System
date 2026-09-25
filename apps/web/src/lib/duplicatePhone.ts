import type { PhoneMatch } from '@cleopatra/shared';
import { ApiRequestError } from './apiError';

/** The 409 DUPLICATE_PHONE conflict: the phone number already belongs to a customer or a lead. */
export interface DuplicatePhoneInfo {
  message: string;
  matches: PhoneMatch[];
  hiddenCount: number;
}

/** Reads a DUPLICATE_PHONE conflict out of a thrown API error; null for any other error. */
export function asDuplicatePhone(err: unknown): DuplicatePhoneInfo | null {
  if (!(err instanceof ApiRequestError) || err.code !== 'DUPLICATE_PHONE') return null;
  return {
    message: err.message,
    matches: Array.isArray(err.payload.matches) ? (err.payload.matches as PhoneMatch[]) : [],
    hiddenCount: Number(err.payload.hiddenCount ?? 0),
  };
}
