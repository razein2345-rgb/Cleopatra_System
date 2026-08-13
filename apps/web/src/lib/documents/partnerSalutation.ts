import type { BusinessPartner } from '@cleopatra/shared';

/**
 * FEATURE-002 (2026-08-13, owner: "لما كتبت إسم العميل فرد واحد كتب السادة
 * ... عايزة يفرق بين الشركة والفرد... اكتب إسم فرد أو سيدة") — "السادة" is
 * a company-style honorific ("Messrs."), wrong for a single individual
 * customer. Falls back to "السيد" for an individual with no gender set yet.
 */
export function partnerSalutation(partner: Pick<BusinessPartner, 'isIndividual' | 'gender'>): string {
  if (!partner.isIndividual) return 'السادة';
  return partner.gender === 'FEMALE' ? 'السيدة' : 'السيد';
}
