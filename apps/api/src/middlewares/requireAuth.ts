import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { prisma } from '../lib/prisma.js';
import { loadAuthContext, type AuthenticatedUser } from '../services/authContext.js';

/** Owner (2026-08-20, "محتاج اشوف مين الموظف الأكتيف على السيستم") — throttle window for the presence-update write below; no need for exact real-time precision, just "recently." */
const PRESENCE_UPDATE_INTERVAL_MS = 60_000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by requireAuth: the caller's StaffProfile, roles, flattened permissions, and accessible branches. */
      auth?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies the Supabase-issued bearer token, then loads the caller's
 * application-level identity (StaffProfile + roles + permissions). A valid
 * Supabase session with no corresponding, active StaffProfile is rejected —
 * Supabase Auth answers "is this a real session," this middleware answers
 * "is this person allowed to use Cleopatra System."
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ success: false, error: { message: 'Missing bearer token' } });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ success: false, error: { message: 'Invalid or expired token' } });
    return;
  }

  const authContext = await loadAuthContext(data.user.id);

  if (!authContext) {
    res
      .status(403)
      .json({ success: false, error: { message: 'No staff profile exists for this account' } });
    return;
  }

  if (!authContext.isActive) {
    res
      .status(403)
      .json({ success: false, error: { message: 'This account has been deactivated' } });
    return;
  }

  req.auth = authContext;

  // Owner (2026-08-20, "محتاج اشوف مين الموظف الأكتيف على السيستم") — a
  // "currently online" signal, distinct from `lastLoginAt` (sign-in moment
  // only). Throttled to at most once/minute per staff member (otherwise
  // every single API call would write to the DB) and fire-and-forget
  // (never awaited, never blocks the request, a failed write here must
  // never fail an otherwise-successful call — this is presence tracking,
  // not a critical write).
  const isStale = !authContext.lastActiveAt || Date.now() - authContext.lastActiveAt.getTime() > PRESENCE_UPDATE_INTERVAL_MS;
  if (isStale) {
    prisma.staffProfile.update({ where: { id: authContext.staffId }, data: { lastActiveAt: new Date() } }).catch(() => {});
  }

  next();
}
