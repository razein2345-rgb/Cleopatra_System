import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { loadAuthContext, type AuthenticatedUser } from '../services/authContext.js';

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
  next();
}
