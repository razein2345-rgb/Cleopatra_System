import { Package } from 'lucide-react';
import type { ReadyProduct } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

export const readyProductsProvider: SearchProvider = {
  id: 'ready-products',
  groupLabel: 'المنتجات الجاهزة',
  permission: 'settings.view',
  async fetch() {
    const products = await apiGet<ReadyProduct[]>('/api/ready-products');
    return products.map((p) => ({
      id: p.id,
      label: p.name,
      value: p.name,
      icon: Package,
      to: '/settings/products',
    }));
  },
};
