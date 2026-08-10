import { Wrench } from 'lucide-react';
import type { Service } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

export const servicesProvider: SearchProvider = {
  id: 'services',
  groupLabel: 'الخدمات',
  permission: 'settings.view',
  async fetch() {
    const services = await apiGet<Service[]>('/api/services');
    return services.map((s) => ({
      id: s.id,
      label: s.name,
      value: s.name,
      icon: Wrench,
      to: '/settings/services',
    }));
  },
};
