import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BranchSummary, BusinessPartner, ItemReorderOverride, Order } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { whatsappLink } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import {
  buildItemGroups,
  buildReminderMessage,
  isOverdue,
  isSoon,
  resolveEffectiveDate,
} from '@/lib/reorderPrediction';

interface DueItem {
  key: string;
  label: string;
  effective: Date;
}

interface PartnerGroup {
  partnerId: string;
  partnerName: string;
  partnerPhone: string | null;
  branchId: string;
  items: DueItem[];
  soonestDate: Date;
}

type Filter = 'ALL' | 'OVERDUE' | 'SOON';

/**
 * Owner (2026-09-09, "استكمال إعادة الطلب التلقائي") — the dashboard's
 * `ReorderDueWidget.tsx` only ever shows the top 6 (customer, item) rows
 * with no way to see the rest, and its "و X عنصر تاني" text goes nowhere.
 * This is that "X عنصر تاني" made real: every due/overdue customer in one
 * place, grouped by customer (so one WhatsApp reminder covers everything
 * they're due for, exactly like `ReorderPredictionTab.tsx`'s per-customer
 * button — reused verbatim via `buildReminderMessage`, rule 5), plus a
 * one-click "افتح أوردر جديد" shortcut (`/orders/new?partnerId=`, a query
 * param `NewOrderPage.tsx` already supports) so acting on a reminder
 * doesn't mean re-searching for the customer from scratch.
 */
export function ReorderDuePage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [overrides, setOverrides] = useState<ItemReorderOverride[] | null>(null);
  const [partners, setPartners] = useState<BusinessPartner[] | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [branchFilter, setBranchFilter] = useState('');

  useEffect(() => {
    apiGet<Order[]>('/api/orders').then(setOrders).catch(() => setOrders([]));
    apiGet<ItemReorderOverride[]>('/api/reorder-overrides')
      .then(setOverrides)
      .catch(() => setOverrides([]));
    apiGet<BusinessPartner[]>('/api/partners').then(setPartners).catch(() => setPartners([]));
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
  }, []);

  const loading = orders === null || overrides === null || partners === null;

  let groups: PartnerGroup[] = [];
  if (!loading) {
    const partnerById = new Map(partners!.map((p) => [p.id, p]));
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
      const partner = partnerById.get(partnerId);
      if (!partner) continue;
      const itemGroups = buildItemGroups(partnerOrders);
      const partnerOverrides = overridesByPartnerAndKey.get(partnerId);
      const dueItems: DueItem[] = [];
      for (const g of itemGroups) {
        const effective = resolveEffectiveDate(g, partnerOverrides?.get(g.key));
        if (!effective) continue;
        const overdue = isOverdue(effective, now);
        const soon = isSoon(effective, now);
        if (!overdue && !soon) continue;
        if (filter === 'OVERDUE' && !overdue) continue;
        if (filter === 'SOON' && !(soon && !overdue)) continue;
        dueItems.push({ key: g.key, label: g.label, effective });
      }
      if (dueItems.length === 0) continue;
      if (branchFilter && partner.branchId !== branchFilter) continue;
      dueItems.sort((a, b) => a.effective.getTime() - b.effective.getTime());
      groups.push({
        partnerId,
        partnerName: partner.nameAr,
        partnerPhone: partner.phone,
        branchId: partner.branchId,
        items: dueItems,
        soonestDate: dueItems[0]!.effective,
      });
    }
    groups = groups.sort((a, b) => a.soonestDate.getTime() - b.soonestDate.getTime());
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">متابعة إعادة الطلب</h1>
          <p className="text-muted-foreground text-sm">
            كل عميل قرّب أو فات ميعاد إعادة الطلب المتوقع بتاعه — تقدير تقريبي من متوسط الفترة بين طلباته السابقة،
            مش تنبؤ ذكاء اصطناعي.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(
            [
              ['ALL', 'الكل'],
              ['OVERDUE', 'فات ميعاده'],
              ['SOON', 'قرّب بس'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={filter === value ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {branches.length > 1 && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : groups.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-5 text-center text-sm">
          مفيش عميل مطابق للفلتر حاليًا.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const overdueCount = g.items.filter((i) => isOverdue(i.effective)).length;
            const reminderLink = whatsappLink(g.partnerPhone, buildReminderMessage(g.partnerName, g.items));
            return (
              <div key={g.partnerId} className="border-border bg-card space-y-2 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link to={`/partners/${g.partnerId}`} className="font-semibold hover:underline">
                      {g.partnerName}
                    </Link>
                    {branches.length > 1 && (
                      <span className="text-muted-foreground text-xs">{branchName(g.branchId)}</span>
                    )}
                    {overdueCount > 0 && (
                      <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-xs font-medium">
                        {overdueCount} فات ميعاده
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {reminderLink && (
                      <a
                        href={reminderLink}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-success/10 text-success inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium hover:underline"
                      >
                        📩 تذكير واتساب ({g.items.length})
                      </a>
                    )}
                    <Link
                      to={`/orders/new?partnerId=${g.partnerId}`}
                      className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium hover:underline"
                    >
                      🛒 افتح أوردر جديد
                    </Link>
                  </div>
                </div>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {g.items.map((i) => (
                    <li key={i.key} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{i.label}</span>
                      <span className={isOverdue(i.effective) ? 'text-destructive' : 'text-warning'}>
                        {i.effective.toLocaleDateString('ar-EG')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
