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

/**
 * Owner (2026-08-20, "ضيفت منتجات جاهزة من الإعدادات المفروض تظهر عند
 * الموظف محمد مظهرتش") — the ready-products/services catalog GET routes
 * had exactly one caller in mind when they were gated on `settings.view`
 * (someone managing the catalog from Settings), but they're also fetched
 * directly by the order composer (`NewOrderPage.tsx`) to populate what a
 * salesperson can even sell — a CASHIER/SALES role has `orders.create`
 * but no reason to also hold `settings.view` (a much bigger surface: business
 * identity, document templates, workflow configs...). The composer's own
 * fetches are wrapped in `.catch(() => [])`, so a caller failing this check
 * previously saw an empty, silently-broken list instead of an error.
 * Passes when the caller holds *any* one of the given keys — unlike
 * `requirePermission`, which is a single hard floor.
 */
export function requireAnyPermission(requiredKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: { message: 'Missing bearer token' } });
      return;
    }

    if (!requiredKeys.some((key) => hasPermission(req.auth!.permissions, key))) {
      res.status(403).json({
        success: false,
        error: { message: `Missing required permission: one of [${requiredKeys.join(', ')}]` },
      });
      return;
    }

    next();
  };
}
