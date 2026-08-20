import { Wrench } from 'lucide-react';
import type { Machine } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

const STATUS_LABELS: Record<Machine['status'], string> = {
  RUNNING: 'شغالة',
  STOPPED: 'متوقفة',
  MAINTENANCE: 'صيانة',
};

export const machinesProvider: SearchProvider = {
  id: 'machines',
  groupLabel: 'الماكينات',
  permission: 'machines.view',
  async fetch() {
    const machines = await apiGet<Machine[]>('/api/machines');
    return machines.map((m) => ({
      id: m.id,
      label: `${m.name} — ${STATUS_LABELS[m.status]}`,
      value: m.name,
      icon: Wrench,
      to: '/machines',
    }));
  },
};
