import type { Prisma } from '../generated/prisma/client.js';
import type { DigitalPriceTierDto } from '@cleopatra/shared';

type DigitalPriceTierRecord = Prisma.DigitalPriceTierGetPayload<object>;

export function mapDigitalPriceTierToDto(tier: DigitalPriceTierRecord): DigitalPriceTierDto {
  return {
    id: tier.id,
    basis: tier.basis,
    colorMode: tier.colorMode,
    sides: tier.sides,
    minQuantity: tier.minQuantity,
    pricePerUnit: tier.pricePerUnit.toNumber(),
    createdAt: tier.createdAt.toISOString(),
    updatedAt: tier.updatedAt.toISOString(),
  };
}
