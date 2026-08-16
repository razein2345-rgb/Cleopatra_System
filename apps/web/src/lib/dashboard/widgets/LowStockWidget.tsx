import { useEffect, useState } from 'react';
import { PackageX } from 'lucide-react';
import type { InventoryItem } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/cleopatra';
import type { DashboardWidgetDefinition } from '../types';

/**
 * ERP-navigation research (2026-08-16, owner: "أنهي قسم المخزون... على
 * أفضل حال") — the low-stock alert already exists on `InventoryPage.tsx`
 * (`isLowStock`/`needs-supplier`), just not visible until someone opens
 * that specific page. Surfacing it on the Dashboard closes that reach
 * gap — same self-fetching pattern as `OpenQuotationsWidget`, no new
 * backend endpoint (reuses `/api/inventory-items/needs-supplier`).
 */
function LowStockWidgetComponent() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);

  useEffect(() => {
    apiGet<InventoryItem[]>('/api/inventory-items/needs-supplier')
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <PackageX className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">بضاعة ناقصة</span>
      </div>
      {items === null ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا توجد بضاعة ناقصة حاليًا.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span className="truncate">{item.name}</span>
              <StatusBadge tone="danger">{item.quantityOnHand.toLocaleString('en-US')}</StatusBadge>
            </li>
          ))}
          {items.length > 5 && <li className="text-muted-foreground text-xs">و{items.length - 5} صنف تاني…</li>}
        </ul>
      )}
    </Card>
  );
}

export const lowStockWidget: DashboardWidgetDefinition = {
  id: 'low-stock',
  permission: 'inventory.view',
  Component: LowStockWidgetComponent,
  span: 'lg',
};
