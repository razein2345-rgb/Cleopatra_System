import type { Prisma } from '../generated/prisma/client.js';
import type { PartnerCommercialProfile } from '@cleopatra/shared';

type ProfileRecord = Prisma.PartnerCommercialProfileGetPayload<object>;

/** Maps a Prisma PartnerCommercialProfile row onto the shared API shape. */
export function mapCommercialProfileToDto(profile: ProfileRecord): PartnerCommercialProfile {
  return {
    id: profile.id,
    partnerId: profile.partnerId,
    creditLimit: profile.creditLimit === null ? null : profile.creditLimit.toNumber(),
    paymentTermsDays: profile.paymentTermsDays,
    preferredPaymentMethod: profile.preferredPaymentMethod,
    priceTier: profile.priceTier,
    status: profile.status,
    riskLevel: profile.riskLevel,
    preferredCurrency: profile.preferredCurrency,
    internalNotes: profile.internalNotes,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
