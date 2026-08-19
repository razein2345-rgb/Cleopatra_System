import { z } from 'zod';

/** Lifecycle stage. Distinct from PartnerRole — see the Prisma schema's PartnerStatus doc comment. */
export const partnerStatusSchema = z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'BLOCKED']);

/** Owner, 2026-08-13 — only meaningful when `isIndividual` is true; drives the printed-document salutation ("السيد"/"السيدة" instead of the company-style "السادة"). */
export const genderSchema = z.enum(['MALE', 'FEMALE']);

/** What capacity a partner acts in; a partner may hold more than one at once. */
export const partnerRoleSchema = z.enum([
  'CUSTOMER',
  'SUPPLIER',
  'GOVERNMENT',
  'SCHOOL',
  'HOSPITAL',
  'COMPANY',
  'PRINTING_HOUSE',
  'INTERNAL_DEPARTMENT',
]);

/** PRODUCT_ROADMAP.md §2 — where a lead/customer came from. */
export const leadSourceSchema = z.enum([
  'REFERRAL',
  'SOCIAL_MEDIA',
  'WALK_IN',
  'PHONE_INQUIRY',
  'WEBSITE',
  'REPEAT_CUSTOMER',
  'OTHER',
]);

export const businessPartnerSchema = z.object({
  id: z.string().uuid(),
  nameAr: z.string().min(1),
  nameEn: z.string().nullable(),
  shortName: z.string().nullable(),
  isIndividual: z.boolean(),
  gender: genderSchema.nullable(),
  roles: z.array(partnerRoleSchema),
  status: partnerStatusSchema,
  branchId: z.string().uuid(),
  salesRepId: z.string().uuid().nullable(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  notes: z.string().nullable(),
  // FEATURE-002 M4. Read-only here, like `isPrimary`/`isDefault` on
  // ContactPerson/PartnerAddress — deliberately absent from create/update
  // below. The only way to change them is the dedicated
  // PUT .../category / PUT .../tags endpoints (see partnerCategoryAssignmentService.ts).
  categoryId: z.string().uuid().nullable(),
  tagIds: z.array(z.string().uuid()),
  leadSource: leadSourceSchema.nullable(),
  lastContactedAt: z.string().nullable(),
  nextFollowUpAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createBusinessPartnerSchema = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1).optional(),
  shortName: z.string().min(1).optional(),
  isIndividual: z.boolean().optional(),
  gender: genderSchema.optional(),
  roles: z.array(partnerRoleSchema).optional(),
  status: partnerStatusSchema.optional(),
  branchId: z.string().uuid(),
  salesRepId: z.string().uuid().optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  leadSource: leadSourceSchema.optional(),
  lastContactedAt: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
});

export const updateBusinessPartnerSchema = z.object({
  nameAr: z.string().min(1).optional(),
  nameEn: z.string().min(1).nullable().optional(),
  shortName: z.string().min(1).nullable().optional(),
  isIndividual: z.boolean().optional(),
  gender: genderSchema.nullable().optional(),
  roles: z.array(partnerRoleSchema).optional(),
  status: partnerStatusSchema.optional(),
  branchId: z.string().uuid().optional(),
  salesRepId: z.string().uuid().nullable().optional(),
  phone: z.string().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  notes: z.string().nullable().optional(),
  leadSource: leadSourceSchema.nullable().optional(),
  lastContactedAt: z.string().nullable().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
});

export type PartnerStatus = z.infer<typeof partnerStatusSchema>;
export type PartnerRole = z.infer<typeof partnerRoleSchema>;
export type LeadSource = z.infer<typeof leadSourceSchema>;
export type Gender = z.infer<typeof genderSchema>;
export type BusinessPartner = z.infer<typeof businessPartnerSchema>;
export type CreateBusinessPartnerInput = z.infer<typeof createBusinessPartnerSchema>;
export type UpdateBusinessPartnerInput = z.infer<typeof updateBusinessPartnerSchema>;
