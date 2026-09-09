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
