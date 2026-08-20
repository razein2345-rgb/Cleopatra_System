import { useEffect, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BusinessPartner, Order } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import type { DashboardWidgetDefinition } from '../types';

/** FEATURE-007 (2026-08-12, owner: "في الداش بورد لازم يكون ظاهرلي ايه الشغل الجاهز اللي منتظر التسليم") — every Order sitting at `status: 'READY'` (finished production, not yet handed to the customer), so staff can see what's waiting for pickup/delivery at a glance instead of hunting through the full order list. */
function ReadyForDeliveryWidgetComponent() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);

  useEffect(() => {
    apiGet<Order[]>('/api/orders')
      .then(setOrders)
      .catch(() => setOrders([]));
    apiGet<BusinessPartner[]>('/api/partners')
      .then(setPartners)
      .catch(() => undefined);
  }, []);

  const ready = orders?.filter((o) => o.status === 'READY') ?? [];
  const partnerName = (id: string | null) => (id ? (partners.find((p) => p.id === id)?.nameAr ?? '—') : 'عميل');

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <PackageCheck className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">شغل جاهز في انتظار التسليم</span>
      </div>
      {orders === null ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : ready.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا يوجد شغل جاهز في انتظار التسليم حاليًا.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {ready.map((o) => (
            <li key={o.id}>
              <Link
                to={`/orders/${o.id}`}
                className="hover:bg-accent/60 -mx-1 flex items-center justify-between rounded-md px-1 py-0.5 transition-colors"
              >
                <span>
                  {o.invoiceNumber} — {partnerName(o.partnerId)}
                </span>
                <span className="text-muted-foreground" dir="ltr">
                  {o.finalTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export const readyForDeliveryWidget: DashboardWidgetDefinition = {
  id: 'ready-for-delivery',
  permission: 'orders.view',
  Component: ReadyForDeliveryWidgetComponent,
  span: 'lg',
};
