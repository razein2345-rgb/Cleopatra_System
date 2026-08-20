import { ClipboardList } from 'lucide-react';
import { PRODUCTION_TRACK_LABELS } from '@cleopatra/shared';
import type { WorkOrder } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

export const workOrdersProvider: SearchProvider = {
  id: 'work-orders',
  groupLabel: 'أوامر الشغل',
  permission: 'work-orders.view',
  async fetch() {
    const workOrders = await apiGet<WorkOrder[]>('/api/work-orders');
    return workOrders.map((wo) => ({
      id: wo.id,
      label: `${wo.workOrderNumber} — ${PRODUCTION_TRACK_LABELS[wo.productionTrack]}`,
      value: `${wo.workOrderNumber} ${PRODUCTION_TRACK_LABELS[wo.productionTrack]}`,
      icon: ClipboardList,
      to: `/work-orders/${wo.id}`,
    }));
  },
};
