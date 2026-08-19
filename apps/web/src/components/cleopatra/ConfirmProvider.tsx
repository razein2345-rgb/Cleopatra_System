import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions (delete, irreversible state change) — the default (blue) is for non-destructive confirmations (e.g. "تحويل عرض السعر إلى فاتورة"). */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * "بيعطّل الاختبار الآلي" (UX_PRODUCT_AUDIT.md § مشكلة 13.1، TOP 10 #4) —
 * `window.confirm()` shows no details about the action's real impact and
 * auto-dismisses with no visible dialog under the Browser pane's automated
 * environment (returns `false` instantly, no network request ever fires).
 * `useConfirm()` is a drop-in async replacement: same "ask, then act only
 * if true" call shape, but a real in-app dialog that can carry a
 * description and shows up in the DOM for real.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} onOpenChange={(open) => !open && close(false)}>
        <DialogContent>
          {options && (
            <>
              <DialogHeader>
                <DialogTitle>{options.title}</DialogTitle>
                {options.description && <DialogDescription>{options.description}</DialogDescription>}
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => close(false)}>
                  {options.cancelLabel ?? 'إلغاء'}
                </Button>
                <Button type="button" variant={options.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
                  {options.confirmLabel ?? 'تأكيد'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
