import { useCallback, useState } from 'react';

/**
 * Owner (2026-09-08, "عايز اقدر اتحكم في مكان العمود يعني احركه اصغر
 * مساحته شوية وهكذا... زي نوشن") — a personal display preference (which
 * order columns/stage-columns appear in, how wide each one is), not
 * shared business data, so it's kept in `localStorage` per browser/viewer
 * (matches this app's existing convention for per-viewer UI state) rather
 * than a new backend model. `storageKey` scopes it — e.g. one key for the
 * "الأقسام" table (same columns everywhere), a key per Kanban template id
 * (each workflow has its own different stage columns).
 *
 * Reconciles the saved order against `defaultOrder` on every read: an id
 * that no longer exists (a column removed in a later release) is dropped,
 * and any id the saved layout has never seen (a column added later) is
 * appended at the end — so a stale saved layout never hides a real column.
 */
export function useColumnLayout(
  storageKey: string,
  defaultOrder: string[],
  defaultWidths: number | Record<string, number> = 160,
) {
  const defaultWidthOf = (id: string): number =>
    typeof defaultWidths === 'number' ? defaultWidths : (defaultWidths[id] ?? 160);
  const orderKey = `pb.columns.${storageKey}.order`;
  const widthsKey = `pb.columns.${storageKey}.widths`;

  const [order, setOrderState] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(orderKey);
      if (raw) {
        const saved = JSON.parse(raw) as string[];
        const valid = saved.filter((id) => defaultOrder.includes(id));
        const missing = defaultOrder.filter((id) => !valid.includes(id));
        return [...valid, ...missing];
      }
    } catch {
      // Private-browsing / storage disabled — fall back to the default order silently.
    }
    return defaultOrder;
  });

  const [widths, setWidthsState] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(widthsKey);
      if (raw) return JSON.parse(raw) as Record<string, number>;
    } catch {
      // Same fallback as above.
    }
    return {};
  });

  const setOrder = useCallback(
    (next: string[]) => {
      setOrderState(next);
      try {
        localStorage.setItem(orderKey, JSON.stringify(next));
      } catch {
        // Non-fatal — the reorder still applies for this render, just won't persist.
      }
    },
    [orderKey],
  );

  const resizeColumn = useCallback(
    (id: string, deltaPx: number, minWidth = 70) => {
      setWidthsState((prev) => {
        const current = prev[id] ?? defaultWidthOf(id);
        const next = { ...prev, [id]: Math.max(minWidth, Math.round(current + deltaPx)) };
        try {
          localStorage.setItem(widthsKey, JSON.stringify(next));
        } catch {
          // Non-fatal, see above.
        }
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widthsKey, defaultWidths],
  );

  const widthOf = useCallback(
    (id: string) => widths[id] ?? defaultWidthOf(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widths, defaultWidths],
  );

  const resetLayout = useCallback(() => {
    setOrder(defaultOrder);
    setWidthsState({});
    try {
      localStorage.removeItem(widthsKey);
    } catch {
      // Non-fatal.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOrder, setOrder, widthsKey]);

  return { order, setOrder, widthOf, resizeColumn, resetLayout };
}
