import { Button } from '@/components/ui/button';

/**
 * UX_PRODUCT_AUDIT.md § مشكلة 12.2 — several list screens render a full
 * table with no pagination, a future risk as data grows (not a current
 * problem per the audit's own framing). Client-side only — pages an
 * already-fetched array in the browser, no backend/API contract change.
 * Explicit "السابق"/"التالي" text rather than arrow icons, since arrows
 * read backwards in this RTL app if copied from an LTR pattern.
 */
export interface PaginationProps {
  /** 1-indexed current page. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-2 text-sm">
      <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        السابق
      </Button>
      <span className="text-muted-foreground" dir="ltr">
        {page} / {totalPages}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        التالي
      </Button>
    </div>
  );
}

/** Slices `items` to the given 1-indexed page — the one bit of math every caller needs, kept in one place. */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
