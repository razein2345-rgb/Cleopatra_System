import { Wallet } from 'lucide-react';
import type { TreasuryEntry } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

const TYPE_LABELS: Record<TreasuryEntry['type'], string> = {
  INCOME: 'وارد',
  EXPENSE: 'منصرف',
  TRANSFER: 'تحويل',
};

/**
 * `treasury.view` only (not `treasury.create`) — the org-wide ledger this
 * fetches is the same one `getTreasuryBalanceHandler` reserves for admins;
 * a reception-level caller already sees their own branch's entries on the
 * Treasury page itself and doesn't need them surfaced in a global search.
 */
export const treasuryProvider: SearchProvider = {
  id: 'treasury',
  groupLabel: 'الخزينة',
  permission: 'treasury.view',
  async fetch() {
    const entries = await apiGet<TreasuryEntry[]>('/api/treasury-entries');
    return entries.map((e) => {
      const description = e.category ?? e.note ?? TYPE_LABELS[e.type];
      return {
        id: e.id,
        label: `${description} — ${e.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        value: `${TYPE_LABELS[e.type]} ${e.category ?? ''} ${e.note ?? ''}`,
        icon: Wallet,
        to: '/treasury',
      };
    });
  },
};
