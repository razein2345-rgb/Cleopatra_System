import { FileText } from 'lucide-react';
import type { Quotation } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

export const quotationsProvider: SearchProvider = {
  id: 'quotations',
  groupLabel: 'عروض الأسعار',
  permission: 'quotations.view',
  async fetch() {
    const quotations = await apiGet<Quotation[]>('/api/quotations');
    return quotations.map((q) => ({
      id: q.id,
      label: q.quotationNumber,
      value: q.quotationNumber,
      icon: FileText,
      to: `/quotations/${q.id}`,
    }));
  },
};
