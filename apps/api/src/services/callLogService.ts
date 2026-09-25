import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CallLog, CreateCallLogInput, UpdateCallLogInput } from '@cleopatra/shared';

const INCLUDE = {
  partner: { select: { nameAr: true } },
  lead: { select: { name: true } },
  staff: { select: { name: true } },
} satisfies Prisma.CallLogInclude;

type CallLogRecord = Prisma.CallLogGetPayload<{ include: typeof INCLUDE }>;

export class CallLogNotFoundError extends Error {
  constructor() {
    super('السجل غير موجود');
    this.name = 'CallLogNotFoundError';
  }
}

/** The customer or lead a new call log points at does not exist (or was deleted). */
export class CallLogTargetNotFoundError extends Error {
  constructor() {
    super('العميل أو الـ Lead المختار غير موجود');
    this.name = 'CallLogTargetNotFoundError';
  }
}

function mapToDto(row: CallLogRecord): CallLog {
  return {
    id: row.id,
    direction: row.direction,
    purpose: row.purpose,
    outcome: row.outcome,
    notes: row.notes,
    partnerId: row.partnerId,
    partnerName: row.partner?.nameAr ?? null,
    leadId: row.leadId,
    leadName: row.lead?.name ?? null,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    branchId: row.branchId,
    staffId: row.staffId,
    staffName: row.staff?.name ?? null,
    followUpDate: row.followUpDate ? row.followUpDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCallLogs(filter: {
  partnerId?: string;
  leadId?: string;
  branchIds?: string[];
}): Promise<CallLog[]> {
  const rows = await prisma.callLog.findMany({
    where: {
      isDeleted: false,
      ...(filter.partnerId ? { partnerId: filter.partnerId } : {}),
      ...(filter.leadId ? { leadId: filter.leadId } : {}),
      ...(filter.branchIds ? { branchId: { in: filter.branchIds } } : {}),
    },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapToDto);
}

/**
 * Branch ids of the customer / lead a NEW call log links to, so the controller can require
 * access to them too (a log linked to another branch's customer surfaces in that customer's
 * activity). Throws CallLogTargetNotFoundError for a missing or deleted target.
 */
export async function getCallTargetBranchIds(target: { partnerId?: string; leadId?: string }): Promise<string[]> {
  const branchIds: string[] = [];
  if (target.partnerId) {
    const partner = await prisma.businessPartner.findUnique({ where: { id: target.partnerId }, select: { branchId: true, isDeleted: true } });
    if (!partner || partner.isDeleted) throw new CallLogTargetNotFoundError();
    branchIds.push(partner.branchId);
  }
  if (target.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: target.leadId }, select: { branchId: true, isDeleted: true } });
    if (!lead || lead.isDeleted) throw new CallLogTargetNotFoundError();
    branchIds.push(lead.branchId);
  }
  return branchIds;
}

/** Branch a call log belongs to - the controller checks access by it before an edit/delete. 404 when missing or deleted. */
export async function getCallLogBranchId(id: string): Promise<string> {
  const row = await prisma.callLog.findUnique({ where: { id }, select: { branchId: true, isDeleted: true } });
  if (!row || row.isDeleted) throw new CallLogNotFoundError();
  return row.branchId;
}

export async function createCallLog(input: CreateCallLogInput, staffId: string): Promise<CallLog> {
  const created = await prisma.callLog.create({
    data: {
      direction: input.direction,
      purpose: input.purpose,
      outcome: input.outcome,
      notes: input.notes ?? null,
      partnerId: input.partnerId ?? null,
      leadId: input.leadId ?? null,
      contactName: input.contactName ?? null,
      contactPhone: input.contactPhone ?? null,
      branchId: input.branchId,
      staffId,
      followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
    },
    include: INCLUDE,
  });
  return mapToDto(created);
}

async function loadOpen(id: string): Promise<CallLogRecord> {
  const row = await prisma.callLog.findUnique({ where: { id }, include: INCLUDE });
  if (!row || row.isDeleted) throw new CallLogNotFoundError();
  return row;
}

export async function updateCallLog(id: string, input: UpdateCallLogInput): Promise<CallLog> {
  await loadOpen(id);
  const updated = await prisma.callLog.update({
    where: { id },
    data: {
      ...(input.direction !== undefined ? { direction: input.direction } : {}),
      ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.followUpDate !== undefined ? { followUpDate: input.followUpDate ? new Date(input.followUpDate) : null } : {}),
    },
    include: INCLUDE,
  });
  return mapToDto(updated);
}

export async function deleteCallLog(id: string, deletedBy: string): Promise<void> {
  await loadOpen(id);
  await prisma.callLog.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), deletedBy } });
}
