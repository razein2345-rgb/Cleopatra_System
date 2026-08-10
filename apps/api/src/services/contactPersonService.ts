import type { Prisma } from '../generated/prisma/client.js';
import type { ContactPerson } from '@cleopatra/shared';

type ContactRecord = Prisma.ContactPersonGetPayload<object>;

/** Maps a Prisma ContactPerson row onto the shared ContactPerson API shape. */
export function mapContactToDto(contact: ContactRecord): ContactPerson {
  return {
    id: contact.id,
    partnerId: contact.partnerId,
    fullName: contact.fullName,
    jobTitle: contact.jobTitle,
    department: contact.department,
    mobile: contact.mobile,
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    email: contact.email,
    preferredContactMethod: contact.preferredContactMethod,
    isPrimary: contact.isPrimary,
    canApproveQuotations: contact.canApproveQuotations,
    canApproveWorkOrders: contact.canApproveWorkOrders,
    canApproveFinancialDocuments: contact.canApproveFinancialDocuments,
    notes: contact.notes,
    isActive: contact.isActive,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

/**
 * Canonical contact ordering (M2 hardening): Primary first, then Active
 * before Inactive, then alphabetically by name. Applied here in the service
 * layer — not left to the frontend — so every consumer of contact lists
 * gets the same order for free.
 */
export const CONTACT_ORDER_BY: Prisma.ContactPersonOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { isActive: 'desc' },
  { fullName: 'asc' },
];
