import { Receipt } from 'lucide-react';
import type { BusinessPartner, Order } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

export const ordersProvider: SearchProvider = {
  id: 'orders',
  groupLabel: 'الطلبات والفواتير',
  permission: 'orders.view',
  async fetch() {
    const orders = await apiGet<Order[]>('/api/orders');

    // Best-effort customer-name lookup — `Order` only carries `partnerId`.
    // A caller without `partners.view` (rare for anyone holding
    // `orders.view`) still gets results, just without the customer name.
    let partnerNameById = new Map<string, string>();
    try {
      const partners = await apiGet<BusinessPartner[]>('/api/partners');
      partnerNameById = new Map(partners.map((p) => [p.id, p.nameAr]));
    } catch {
      // fall through with an empty map
    }

    return orders.map((o) => {
      const partnerName = o.partnerId ? partnerNameById.get(o.partnerId) : undefined;
      return {
        id: o.id,
        label: partnerName ? `${o.invoiceNumber} — ${partnerName}` : o.invoiceNumber,
        value: `${o.invoiceNumber} ${partnerName ?? ''}`,
        icon: Receipt,
        to: `/orders/${o.id}`,
      };
    });
  },
};
