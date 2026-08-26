import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BusinessPartner, ItemReorderOverride, Order } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { buildItemGroups, isOverdue, isSoon, resolveEffectiveDate } from '@/lib/reorderPrediction';
import type { DashboardWidgetDefinition } from '../types';

interface DueRow {
  partnerId: string;
  partnerName: string;
  itemLabel: string;
  effective: Date;
}

/**
 * Owner (2026-08-26, promised alongside ReorderPredictionTab.tsx — "هعمله
 * كـويدجت في لوحة التحكم يعرض عملاء قرّب ميعاد إعادة الطلب المتوقع
 * بتاعهم") — the same per-item reorder heuristic
 * (`ReorderPredictionTab.tsx`'s tab is per-customer; this is the
 * cross-customer surface any employee sees without opening a specific
 * customer's profile first). Reuses `reorderPrediction.ts` (rule 5, no
 * duplicate grouping logic) and the new `/api/reorder-overrides`
 * cross-partner read.
 */
function ReorderDueWidgetComponent() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [overrides, setOverrides] = useState<ItemReorderOverride[] | null>(null);
  const [partners, setPartners] = useState<BusinessPartner[] | null>(null);

  useEffect(() => {
    apiGet<Order[]>('/api/orders').then(setOrders).catch(() => setOrders([]));
    apiGet<ItemReorderOverride[]>('/api/reorder-overrides')
      .then(setOverrides)
      .catch(() => setOverrides([]));
    apiGet<BusinessPartner[]>('/api/partners').then(setPartners).catch(() => setPartners([]));
  }, []);

  const loading = orders === null || overrides === null || partners === null;

  let rows: DueRow[] = [];
  if (!loading) {
    const partnerNameById = new Map(partners!.map((p) => [p.id, p.nameAr]));
    const ordersByPartner = new Map<string, Order[]>();
    for (const o of orders!) {
      if (!o.partnerId) continue;
      const list = ordersByPartner.get(o.partnerId) ?? [];
      list.push(o);
      ordersByPartner.set(o.partnerId, list);
    }
    const overridesByPartnerAndKey = new Map<string, Map<string, ItemReorderOverride>>();
    for (const ov of overrides!) {
      const map = overridesByPartnerAndKey.get(ov.partnerId) ?? new Map();
      map.set(ov.itemKey, ov);
      overridesByPartnerAndKey.set(ov.partnerId, map);
    }

    const now = Date.now();
    for (const [partnerId, partnerOrders] of ordersByPartner) {
      const groups = buildItemGroups(partnerOrders);
      const partnerOverrides = overridesByPartnerAndKey.get(partnerId);
      for (const g of groups) {
        const effective = resolveEffectiveDate(g, partnerOverrides?.get(g.key));
        if (effective && (isOverdue(effective, now) || isSoon(effective, now))) {
          rows.push({
            partnerId,
            partnerName: partnerNameById.get(partnerId) ?? 'عميل',
            itemLabel: g.label,
            effective,
          });
        }
      }
    }
    rows = rows.sort((a, b) => a.effective.getTime() - b.effective.getTime());
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <RefreshCw className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">عملاء قرّب ميعاد إعادة الطلب المتوقع بتاعهم</span>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">مفيش عميل قرّب ميعاده حاليًا.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.slice(0, 6).map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3">
              <Link to={`/partners/${r.partnerId}`} className="hover:underline">
                <span className="font-medium">{r.partnerName}</span>
                <span className="text-muted-foreground"> — {r.itemLabel}</span>
              </Link>
              <span className={r.effective.getTime() < Date.now() ? 'text-destructive' : 'text-warning'}>
                {r.effective.toLocaleDateString('ar-EG')}
              </span>
            </li>
          ))}
          {rows.length > 6 && <li className="text-muted-foreground text-xs">و{rows.length - 6} عنصر تاني…</li>}
        </ul>
      )}
    </Card>
  );
}

export const reorderDueWidget: DashboardWidgetDefinition = {
  id: 'reorder-due',
  permission: 'orders.view',
  Component: ReorderDueWidgetComponent,
  span: 'lg',
};
