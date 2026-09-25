import type { Request, Response } from 'express';
import { canAccessBranch } from '../services/authContext.js';
import type { DuplicatePhoneError } from '../services/leadService.js';

/**
 * 409 for a phone number that already exists (owner decision, 2026-09-25). Matching is
 * business-wide, but a branch-scoped caller is only told about records of branches they can
 * access; the rest are just counted, so this can never be used to read another branch's
 * customers. Shared by the leads and customers controllers.
 */
export function sendDuplicatePhone(err: DuplicatePhoneError, auth: NonNullable<Request['auth']>, res: Response): void {
  const visible = err.matches.filter((m) => canAccessBranch(auth, m.branchId));
  const hiddenCount = err.matches.length - visible.length;
  const first = visible[0];
  const what = first ? (first.kind === 'partner' ? `عميل "${first.name}"` : `Lead "${first.name}"`) : 'سجل في فرع تاني';
  res.status(409).json({
    success: false,
    error: {
      message: `الرقم ده موجود بالفعل عند ${what}${err.matches.length > 1 ? ` (و${err.matches.length - 1} تانيين)` : ''}.`,
      code: 'DUPLICATE_PHONE',
      matches: visible,
      hiddenCount,
    },
  });
}
