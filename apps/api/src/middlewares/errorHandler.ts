import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodIssue } from 'zod';

export function notFoundHandler(req: Request, res: Response) {
  res
    .status(404)
    .json({ success: false, error: { message: `Route not found: ${req.originalUrl}` } });
}

/**
 * Owner (2026-09-01, "بيقولي Validation failed... اكيد مش مستعد احسب كل ده
 * تاني") — the generic "Validation failed" message gave zero clue which of
 * many quotation/order items had the problem, so a real validation error on
 * save read exactly like data loss. The server already computed the exact
 * field via Zod; this had just never been surfaced past the generic label.
 * Arabic-only-UI rule (CLAUDE.md) still applies to error text, so each Zod
 * issue code gets its own Arabic phrase — only the technical path
 * (`items[4].pricing.colorCount`, a code identifier, not UI prose) stays
 * Latin, same exception the rule itself already carves out for paths/ids.
 */
function arabicIssueMessage(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' || issue.received === 'null' ? 'الحقل مطلوب' : 'نوع البيانات غير صحيح';
    case 'too_small':
      return issue.type === 'string'
        ? 'القيمة قصيرة جدًا أو فارغة'
        : issue.exact
          ? `القيمة لازم تساوي ${issue.minimum}`
          : `القيمة لازم تكون ${issue.inclusive ? 'على الأقل' : 'أكبر من'} ${issue.minimum}`;
    case 'too_big':
      return issue.exact
        ? `القيمة لازم تساوي ${issue.maximum}`
        : `القيمة لازم تكون ${issue.inclusive ? 'على الأكثر' : 'أقل من'} ${issue.maximum}`;
    case 'invalid_enum_value':
    case 'invalid_literal':
    case 'invalid_union_discriminator':
      return 'قيمة غير مسموح بها';
    case 'invalid_string':
      return 'صيغة النص غير صحيحة';
    case 'unrecognized_keys':
      return `حقول غير معروفة: ${issue.keys.join('، ')}`;
    case 'invalid_union':
      return 'البيانات لا تطابق أي شكل متوقع';
    case 'custom':
      return issue.message || 'قيمة غير صالحة';
    default:
      return issue.message || 'قيمة غير صالحة';
  }
}

function formatZodPath(path: (string | number)[]): string {
  return path
    .map((segment, i) => (typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`))
    .join('');
}

function formatZodError(err: ZodError): string {
  const details = err.issues
    .map((issue) => {
      const path = formatZodPath(issue.path);
      const message = arabicIssueMessage(issue);
      return path ? `${path}: ${message}` : message;
    })
    .join('؛ ');
  return `بيانات غير صالحة — ${details}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { message: formatZodError(err), code: 'VALIDATION_ERROR' },
      issues: err.flatten(),
    });
    return;
  }

  console.error(err);
  const message = err instanceof Error ? err.message : 'حدث خطأ في الخادم';
  res.status(500).json({ success: false, error: { message } });
}
