import type { Prisma } from '../generated/prisma/client.js';
import type { PartnerAddress } from '@cleopatra/shared';

type AddressRecord = Prisma.PartnerAddressGetPayload<object>;

/** Maps a Prisma PartnerAddress row onto the shared PartnerAddress API shape. */
export function mapAddressToDto(address: AddressRecord): PartnerAddress {
  return {
    id: address.id,
    partnerId: address.partnerId,
    name: address.name,
    type: address.type,
    country: address.country,
    governorate: address.governorate,
    city: address.city,
    district: address.district,
    street: address.street,
    building: address.building,
    floor: address.floor,
    apartment: address.apartment,
    postalCode: address.postalCode,
    googleMapsUrl: address.googleMapsUrl,
    latitude: address.latitude,
    longitude: address.longitude,
    notes: address.notes,
    isDefault: address.isDefault,
    isActive: address.isActive,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}

/**
 * Canonical address ordering: Default first, then Active before Inactive,
 * then alphabetically by name — same shape as the M2 contact ordering rule,
 * applied here in the service layer so every consumer gets the same order.
 */
export const ADDRESS_ORDER_BY: Prisma.PartnerAddressOrderByWithRelationInput[] = [
  { isDefault: 'desc' },
  { isActive: 'desc' },
  { name: 'asc' },
];
