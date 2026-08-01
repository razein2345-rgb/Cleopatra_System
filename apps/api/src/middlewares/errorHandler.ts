import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function notFoundHandler(req: Request, res: Response) {
  res
    .status(404)
    .json({ success: false, error: { message: `Route not found: ${req.originalUrl}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { message: 'Validation failed', code: 'VALIDATION_ERROR' },
      issues: err.flatten(),
    });
    return;
  }

  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ success: false, error: { message } });
}
