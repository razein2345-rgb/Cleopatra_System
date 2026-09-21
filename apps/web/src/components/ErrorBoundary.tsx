import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * 2026-09-22 fix (see `docs/AI/BUGS/KNOWN_ISSUES.md`'s "Connection
 * terminated unexpectedly" entry) — a render-time crash on a
 * financially-sensitive page (a malformed API response mid-payment, for
 * example, confirmed live during Cutover verification) used to blank the
 * whole page with zero feedback, forcing a confused, unguided reload —
 * which is also the one thing that can reset an idempotency key (see
 * `useIdempotencyKey.ts`'s own doc comment). This stops that specific
 * class of failure at the page boundary instead: a recoverable screen
 * that tells the user to verify what actually happened before retrying,
 * rather than a dead blank page.
 *
 * Wraps whole pages (`NewOrderPage`, `OrderDocumentPage`), not just their
 * payment dialogs — the crash actually observed originated from a `order`
 * state update rippling through `react-dom`'s own reconciliation, not
 * from code confined to the dialog's own subtree; a narrower boundary
 * around only the dialog would not have caught it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught a render crash:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-md space-y-4 p-8 text-center" dir="rtl">
          <h2 className="text-destructive text-lg font-semibold">حصل خطأ غير متوقع</h2>
          <p className="text-muted-foreground text-sm">
            تأكد من حالة العملية (هل اتسجلت فعلاً؟) قبل ما تحاول تاني — راجع الفاتورة أو الطلب من صفحة الطلبات.
          </p>
          <Button onClick={() => window.location.reload()}>إعادة تحميل الصفحة</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
