import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { getUserDto } from '../services/userService.js';
import { recordAudit } from '../services/auditService.js';

/**
 * Called by the frontend immediately after a successful Supabase sign-in.
 * Supabase already verified the password; this endpoint registers the login
 * in our system — updates `lastLoginAt`, writes an audit entry — and returns
 * the caller's profile + flattened permissions so the frontend can bootstrap
 * its UI without a second round trip.
 */
export async function login(req: Request, res: Response) {
  const auth = req.auth!;

  await prisma.staffProfile.update({
    where: { id: auth.staffId },
    data: { lastLoginAt: new Date() },
  });

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: auth.staffId,
    action: 'LOGIN',
    performedById: auth.staffId,
    branchId: auth.branchId,
  });

  const user = await getUserDto(auth.staffId);
  res.json({ success: true, data: { user, permissions: auth.permissions } });
}

/**
 * Called by the frontend right before it calls `supabase.auth.signOut()` —
 * must happen while the token is still valid, since a real Supabase sign-out
 * invalidates it. Records the logout in the audit log; the actual session
 * termination happens client-side against Supabase.
 */
export async function logout(req: Request, res: Response) {
  const auth = req.auth!;

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: auth.staffId,
    action: 'LOGOUT',
    performedById: auth.staffId,
    branchId: auth.branchId,
  });

  res.status(204).send();
}

/** Rehydrates the current user's profile + permissions on page load — no audit entry, no side effects. */
export async function me(req: Request, res: Response) {
  const auth = req.auth!;
  const user = await getUserDto(auth.staffId);
  res.json({ success: true, data: { user, permissions: auth.permissions } });
}
