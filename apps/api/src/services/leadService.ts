import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateLeadInput, Lead, UpdateLeadInput } from '@cleopatra/shared';
import { mapPartnerToDto } from './businessPartnerService.js';

/**
 * PRODUCT_ROADMAP.md §2 ("المرحلة الثانية") — a Lead is a separate,
 * lighter-weight entity from BusinessPartner. See lead.ts's own doc
 * comment for the full reasoning behind when/how a Lead becomes a real
 * BusinessPartner (owner, 2026-08-20: never a bare "convert" with nothing
 * behind it — only the moment a real Quotation is being built for them,
 * via `convertLeadToPartner` below, called from the "اعمل عرض سعر" action).
 */

type LeadRecord = Prisma.LeadGetPayload<object>;

export class LeadNotFoundError extends Error {
  constructor() {
    super('Lead not found');
    this.name = 'LeadNotFoundError';
  }
}

export class LeadAlreadyResolvedError extends Error {
  constructor() {
    super('هذا الـLead اتحول لعميل أو اترفض بالفعل');
    this.name = 'LeadAlreadyResolvedError';
  }
}

export function mapLeadToDto(lead: LeadRecord): Lead {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    stage: lead.stage,
    notes: lead.notes,
    branchId: lead.branchId,
    assignedToId: lead.assignedToId,
    recordedById: lead.recordedById,
    nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.toISOString() : null,
    convertedPartnerId: lead.convertedPartnerId,
    rejectedReason: lead.rejectedReason,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

export async function listLeads(): Promise<Lead[]> {
  const leads = await prisma.lead.findMany({ where: { isDeleted: false }, orderBy: { createdAt: 'desc' } });
  return leads.map(mapLeadToDto);
}

export async function getLead(id: string): Promise<Lead | null> {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.isDeleted) return null;
  return mapLeadToDto(lead);
}

export async function createLead(input: CreateLeadInput, recordedById: string): Promise<Lead> {
  const created = await prisma.lead.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      source: input.source ?? null,
      notes: input.notes ?? null,
      branchId: input.branchId,
      assignedToId: input.assignedToId ?? null,
      nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
      recordedById,
    },
  });
  return mapLeadToDto(created);
}

async function loadOpenLead(id: string): Promise<LeadRecord> {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.isDeleted) throw new LeadNotFoundError();
  if (lead.stage === 'CONVERTED' || lead.stage === 'REJECTED') throw new LeadAlreadyResolvedError();
  return lead;
}

export async function updateLead(id: string, input: UpdateLeadInput): Promise<Lead> {
  await loadOpenLead(id);
  const updated = await prisma.lead.update({
    where: { id },
    data: {
      ...input,
      nextFollowUpAt: input.nextFollowUpAt !== undefined ? (input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null) : undefined,
    },
  });
  return mapLeadToDto(updated);
}

/** NEW → CONTACTED → QUALIFIED only — never jumps to CONVERTED/REJECTED (their own dedicated actions below). */
export async function advanceLeadStage(id: string, stage: 'CONTACTED' | 'QUALIFIED'): Promise<Lead> {
  await loadOpenLead(id);
  const updated = await prisma.lead.update({ where: { id }, data: { stage } });
  return mapLeadToDto(updated);
}

export async function rejectLead(id: string, reason: string | undefined): Promise<Lead> {
  await loadOpenLead(id);
  const updated = await prisma.lead.update({
    where: { id },
    data: { stage: 'REJECTED', rejectedReason: reason ?? null },
  });
  return mapLeadToDto(updated);
}

/**
 * Owner (2026-08-20, "طالما مطلبش قبل كده... يفضل في الليدز لحد ما يقبل
 * اول عرض السعر") — the ONLY way a Lead becomes a BusinessPartner: called
 * atomically from the "اعمل عرض سعر" action, never a standalone "convert"
 * button. Creates the partner as `status: 'PROSPECT'` (not ACTIVE) — they
 * haven't bought anything yet, just reached the quoting stage; flipping to
 * ACTIVE happens later, when a real Quotation for them is actually
 * accepted and converted to an Order (see quotations.ts's `convertQuotation`).
 */
export async function convertLeadToPartner(
  id: string,
): Promise<{ leadId: string; partnerId: string; partner: ReturnType<typeof mapPartnerToDto> }> {
  const lead = await loadOpenLead(id);

  return prisma.$transaction(async (tx) => {
    const partner = await tx.businessPartner.create({
      data: {
        nameAr: lead.name,
        phone: lead.phone,
        email: lead.email,
        branchId: lead.branchId,
        salesRepId: lead.assignedToId,
        leadSource: lead.source,
        status: 'PROSPECT',
        notes: lead.notes,
      },
    });
    await tx.lead.update({
      where: { id },
      data: { stage: 'CONVERTED', convertedPartnerId: partner.id },
    });
    return { leadId: id, partnerId: partner.id, partner: mapPartnerToDto(partner, []) };
  });
}

export async function deleteLead(id: string, deletedBy: string): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.isDeleted) throw new LeadNotFoundError();
  await prisma.lead.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), deletedBy } });
}
