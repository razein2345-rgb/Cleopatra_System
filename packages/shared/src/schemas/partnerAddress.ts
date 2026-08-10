import { z } from 'zod';

export const addressTypeSchema = z.enum([
  'BILLING',
  'SHIPPING',
  'OFFICE',
  'FACTORY',
  'BRANCH',
  'WAREHOUSE',
  'REGISTERED',
  'OTHER',
]);

export const partnerAddressSchema = z.object({
  id: z.string().uuid(),
  partnerId: z.string().uuid(),
  name: z.string().min(1),
  type: addressTypeSchema,
  country: z.string().nullable(),
  governorate: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  street: z.string().nullable(),
  building: z.string().nullable(),
  floor: z.string().nullable(),
  apartment: z.string().nullable(),
  postalCode: z.string().nullable(),
  googleMapsUrl: z.string().url().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  notes: z.string().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * `isDefault` is deliberately absent from create/update — an address is
 * never created/edited directly into default status; default status only
 * ever changes through the dedicated set-default action, which atomically
 * unsets the previous default address of the same type (see
 * 03_IMPLEMENT.md M3, mirroring the M2 primary-contact pattern).
 */
export const createPartnerAddressSchema = z.object({
  name: z.string().min(1),
  type: addressTypeSchema,
  country: z.string().min(1).optional(),
  governorate: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  street: z.string().min(1).optional(),
  building: z.string().min(1).optional(),
  floor: z.string().min(1).optional(),
  apartment: z.string().min(1).optional(),
  postalCode: z.string().min(1).optional(),
  googleMapsUrl: z.string().url().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updatePartnerAddressSchema = z.object({
  name: z.string().min(1).optional(),
  type: addressTypeSchema.optional(),
  country: z.string().min(1).nullable().optional(),
  governorate: z.string().min(1).nullable().optional(),
  city: z.string().min(1).nullable().optional(),
  district: z.string().min(1).nullable().optional(),
  street: z.string().min(1).nullable().optional(),
  building: z.string().min(1).nullable().optional(),
  floor: z.string().min(1).nullable().optional(),
  apartment: z.string().min(1).nullable().optional(),
  postalCode: z.string().min(1).nullable().optional(),
  googleMapsUrl: z.string().url().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type AddressType = z.infer<typeof addressTypeSchema>;
export type PartnerAddress = z.infer<typeof partnerAddressSchema>;
export type CreatePartnerAddressInput = z.infer<typeof createPartnerAddressSchema>;
export type UpdatePartnerAddressInput = z.infer<typeof updatePartnerAddressSchema>;
