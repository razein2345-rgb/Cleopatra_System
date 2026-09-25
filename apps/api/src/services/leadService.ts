import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  createLeadSchema,
  normalizePhoneKey,
  type CreateLeadInput,
  type Lead,
  type LeadImportRow,
  type LeadImportRowResult,
  type LeadSource,
  type PhoneMatch,
  type UpdateLeadInput,
} from '@cleopatra/shared';
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

/** The phone number entered already belongs to a customer (or, when leads are checked, another lead). */
export class DuplicatePhoneError extends Error {
  constructor(public readonly matches: PhoneMatch[]) {
    super('هذا الرقم موجود بالفعل');
    this.name = 'DuplicatePhoneError';
  }
}

export function describePhoneMatch(match: PhoneMatch): string {
  return match.kind === 'partner' ? `عميل "${match.name}"` : `Lead "${match.name}"`;
}

/**
 * Duplicate detection by phone number (owner decision, 2026-09-25 - CRM review). Loads every
 * live customer (and, optionally, every open lead) ONCE and answers by normalized number, so
 * "010 1234 5678", "+20 101 234 5678" and "01012345678" are the same person. Business-wide, not
 * branch-scoped: a duplicate is a duplicate whichever branch holds it (the controller decides
 * what a branch-scoped caller may be told). A converted lead is skipped - its customer already
 * represents it. `remember` adds a row created during a batch so later rows of the same file
 * are caught too.
 */
export async function loadPhoneIndex(options: { includeLeads: boolean; excludeLeadId?: string }): Promise<{
  lookup: (phone: string) => PhoneMatch[];
  remember: (match: PhoneMatch, phone: string) => void;
}> {
  const [partners, leads] = await Promise.all([
    prisma.businessPartner.findMany({
      where: { isDeleted: false, phone: { not: null } },
      select: { id: true, nameAr: true, phone: true, branchId: true, status: true },
    }),
    options.includeLeads
      ? prisma.lead.findMany({
          where: { isDeleted: false, stage: { not: 'CONVERTED' }, ...(options.excludeLeadId ? { id: { not: options.excludeLeadId } } : {}) },
          select: { id: true, name: true, phone: true, branchId: true, stage: true },
        })
      : Promise.resolve([]),
  ]);

  const byKey = new Map<string, PhoneMatch[]>();
  const remember = (match: PhoneMatch, phone: string) => {
    const key = normalizePhoneKey(phone);
    if (!key) return;
    byKey.set(key, [...(byKey.get(key) ?? []), match]);
  };
  for (const p of partners) remember({ kind: 'partner', id: p.id, name: p.nameAr, branchId: p.branchId, detail: p.status }, p.phone ?? '');
  for (const l of leads) remember({ kind: 'lead', id: l.id, name: l.name, branchId: l.branchId, detail: l.stage }, l.phone);

  return {
    lookup: (phone) => {
      const key = normalizePhoneKey(phone);
      return key ? (byKey.get(key) ?? []) : [];
    },
    remember,
  };
}

/** Throws DuplicatePhoneError when the phone already exists (see `loadPhoneIndex`). */
export async function assertNoDuplicatePhone(phone: string, options: { includeLeads: boolean; excludeLeadId?: string }): Promise<void> {
  const { lookup } = await loadPhoneIndex(options);
  const matches = lookup(phone);
  if (matches.length > 0) throw new DuplicatePhoneError(matches);
}

export function mapLeadToDto(lead: LeadRecord): Lead {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    facebookUrl: lead.facebookUrl,
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

export async function listLeads(filter: { branchIds?: string[] } = {}): Promise<Lead[]> {
  const leads = await prisma.lead.findMany({
    where: { isDeleted: false, ...(filter.branchIds ? { branchId: { in: filter.branchIds } } : {}) },
    orderBy: { createdAt: 'desc' },
  });
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
      facebookUrl: input.facebookUrl ?? null,
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

/**
 * Owner (2026-09-08, Excel/CSV import) — creates one Lead per already-parsed
 * row, reusing `createLead` as-is (rule 5: no duplicate creation logic)
 * rather than a bulk `createMany` — each row goes through the exact same
 * `createLeadSchema` validation a manually-typed Lead would, and a bad row
 * (missing name, malformed email, ...) only fails that one row instead of
 * the whole batch.
 */
export async function bulkCreateLeads(
  rows: LeadImportRow[],
  branchId: string,
  source: LeadSource | undefined,
  recordedById: string,
  options: { allowDuplicates?: boolean } = {},
): Promise<LeadImportRowResult[]> {
  const results: LeadImportRowResult[] = [];
  // Unless the user chose to import duplicates, a row whose phone already exists (as a customer or a
  // lead) - or repeats an earlier row of the same file - is reported and skipped, never created.
  const phoneIndex = options.allowDuplicates ? null : await loadPhoneIndex({ includeLeads: true });
  for (const row of rows) {
    const parsed = createLeadSchema.safeParse({
      name: row.name,
      phone: row.phone,
      email: row.email || undefined,
      facebookUrl: row.facebookUrl || undefined,
      branchId,
      source,
    });
    if (!parsed.success) {
      results.push({ rowNumber: row.rowNumber, success: false, error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' });
      continue;
    }
    const duplicates = phoneIndex ? phoneIndex.lookup(parsed.data.phone) : [];
    if (duplicates.length > 0) {
      results.push({ rowNumber: row.rowNumber, success: false, error: `الرقم موجود بالفعل عند ${describePhoneMatch(duplicates[0]!)}` });
      continue;
    }
    try {
      const lead = await createLead(parsed.data, recordedById);
      phoneIndex?.remember({ kind: 'lead', id: lead.id, name: lead.name, branchId: lead.branchId, detail: lead.stage }, lead.phone);
      results.push({ rowNumber: row.rowNumber, success: true, lead });
    } catch (err) {
      results.push({ rowNumber: row.rowNumber, success: false, error: err instanceof Error ? err.message : 'تعذر إنشاء الـLead' });
    }
  }
  return results;
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
  options: { allowDuplicate?: boolean } = {},
): Promise<{ leadId: string; partnerId: string; partner: ReturnType<typeof mapPartnerToDto> }> {
  const lead = await loadOpenLead(id);
  // Converting creates a NEW customer: refuse when one with this phone already exists, unless the
  // user was shown it and chose to create another anyway.
  if (!options.allowDuplicate) await assertNoDuplicatePhone(lead.phone, { includeLeads: false });

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

/**
 * Branch a lead belongs to - lets the controller check branch access by the LEAD's own
 * branch before any update / stage change / reject / convert / delete. 404 when the lead
 * does not exist or was deleted.
 */
export async function getLeadBranchId(id: string): Promise<string> {
  const lead = await prisma.lead.findUnique({ where: { id }, select: { branchId: true, isDeleted: true } });
  if (!lead || lead.isDeleted) throw new LeadNotFoundError();
  return lead.branchId;
}

export async function deleteLead(id: string, deletedBy: string): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.isDeleted) throw new LeadNotFoundError();
  await prisma.lead.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), deletedBy } });
}
