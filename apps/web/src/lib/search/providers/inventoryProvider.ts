import { Boxes } from 'lucide-react';
import type { InventoryItem } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

export const inventoryProvider: SearchProvider = {
  id: 'inventory',
  groupLabel: 'المخزون',
  permission: 'inventory.view',
  async fetch() {
    const items = await apiGet<InventoryItem[]>('/api/inventory-items');
    return items.map((i) => ({
      id: i.id,
      label: i.isLowStock ? `${i.name} (منخفض)` : i.name,
      value: `${i.name} ${i.barcode ?? ''}`,
      icon: Boxes,
      to: '/inventory',
    }));
  },
};
