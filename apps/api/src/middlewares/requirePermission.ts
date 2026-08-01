import type { NextFunction, Request, Response } from 'express';
import { hasPermission } from '@cleopatra/shared';

/**
 * Checks the caller's flattened permission set (loaded by `requireAuth`,
 * which must run first) against a required permission key. Never trusts
 * anything the client claims about its own permissions — this always
 * re-checks the server-loaded `req.auth.permissions`, which came from the
 * database, not from the request.
 */
export function requirePermission(requiredKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: { message: 'Missing bearer token' } });
      return;
    }

    if (!hasPermission(req.auth.permissions, requiredKey)) {
      res.status(403).json({
        success: false,
        error: { message: `Missing required permission: ${requiredKey}` },
      });
      return;
    }

    next();
  };
}
