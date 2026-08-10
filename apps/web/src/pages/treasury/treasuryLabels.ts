import type { PaymentMethod, TreasuryType } from '@cleopatra/shared';

export const TREASURY_TYPE_LABELS: Record<TreasuryType, string> = {
  INCOME: 'وارد',
  EXPENSE: 'منصرف',
  TRANSFER: 'تحويل',
};

export const TREASURY_TYPE_OPTIONS = Object.entries(TREASURY_TYPE_LABELS) as [TreasuryType, string][];

export function treasuryTypeTone(type: TreasuryType): 'success' | 'danger' | 'neutral' {
  if (type === 'INCOME') return 'success';
  if (type === 'EXPENSE') return 'danger';
  return 'neutral';
}

/**
 * FEATURE-007 M3 refinement (owner, 2026-08-09) — each wallet card colored
 * by its real brand color (فودافون كاش/انستاباي), not the generic status
 * palette. Cash/Bank stay on the design system's own neutral tones since
 * neither has a single universally-recognized brand color the way the two
 * payment apps do.
 */
export const WALLET_COLORS: Record<PaymentMethod, { bg: string; text: string }> = {
  CASH: { bg: 'bg-success/10', text: 'text-success' },
  BANK_ACCOUNT: { bg: 'bg-info/10', text: 'text-info' },
  // Vodafone's brand red.
  VODAFONE_CASH: { bg: 'bg-[#E60000]/10', text: 'text-[#E60000]' },
  // InstaPay's brand purple.
  INSTAPAY: { bg: 'bg-[#6E2585]/10', text: 'text-[#6E2585]' },
};
