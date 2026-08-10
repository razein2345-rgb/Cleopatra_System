import { Building2 } from 'lucide-react';
import type { BusinessPartner } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

export const partnersProvider: SearchProvider = {
  id: 'partners',
  groupLabel: 'العملاء والموردون',
  permission: 'partners.view',
  async fetch() {
    const partners = await apiGet<BusinessPartner[]>('/api/partners');
    return partners.map((p) => ({
      id: p.id,
      label: p.phone ? `${p.nameAr} — ${p.phone}` : p.nameAr,
      value: `${p.nameAr} ${p.nameEn ?? ''} ${p.phone ?? ''} ${p.email ?? ''}`,
      icon: Building2,
      to: `/partners/${p.id}`,
    }));
  },
};
