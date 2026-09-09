import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ContentCalendarEntry, CreateContentCalendarEntryInput, UpdateContentCalendarEntryInput } from '@cleopatra/shared';

const INCLUDE = {
  assignedTo: { select: { name: true } },
  recordedBy: { select: { name: true } },
} satisfies Prisma.ContentCalendarEntryInclude;

type ContentCalendarEntryRecord = Prisma.ContentCalendarEntryGetPayload<{ include: typeof INCLUDE }>;

export class ContentCalendarEntryNotFoundError extends Error {
  constructor() {
    super('العنصر غير موجود');
    this.name = 'ContentCalendarEntryNotFoundError';
  }
}

function mapToDto(row: ContentCalendarEntryRecord): ContentCalendarEntry {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    contentType: row.contentType,
    notes: row.notes,
    publishedUrl: row.publishedUrl,
    scheduledDate: row.scheduledDate.toISOString(),
    status: row.status,
    branchId: row.branchId,
    assignedToId: row.assignedToId,
    assignedToName: row.assignedTo?.name ?? null,
    recordedById: row.recordedById,
    recordedByName: row.recordedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listContentCalendarEntries(filter: { branchIds?: string[] }): Promise<ContentCalendarEntry[]> {
  const rows = await prisma.contentCalendarEntry.findMany({
    where: {
      isDeleted: false,
      ...(filter.branchIds ? { OR: [{ branchId: { in: filter.branchIds } }, { branchId: null }] } : {}),
    },
    include: INCLUDE,
    orderBy: { scheduledDate: 'asc' },
  });
  return rows.map(mapToDto);
}

export async function createContentCalendarEntry(
  input: CreateContentCalendarEntryInput,
  staffId: string,
): Promise<ContentCalendarEntry> {
  const created = await prisma.contentCalendarEntry.create({
    data: {
      title: input.title,
      platform: input.platform,
      contentType: input.contentType ?? null,
      notes: input.notes ?? null,
      scheduledDate: new Date(input.scheduledDate),
      status: input.status ?? 'IDEA',
      branchId: input.branchId ?? null,
      assignedToId: input.assignedToId ?? null,
      recordedById: staffId,
    },
    include: INCLUDE,
  });
  return mapToDto(created);
}

async function loadOpen(id: string): Promise<ContentCalendarEntryRecord> {
  const row = await prisma.contentCalendarEntry.findUnique({ where: { id }, include: INCLUDE });
  if (!row || row.isDeleted) throw new ContentCalendarEntryNotFoundError();
  return row;
}

export async function updateContentCalendarEntry(
  id: string,
  input: UpdateContentCalendarEntryInput,
): Promise<ContentCalendarEntry> {
  await loadOpen(id);
  const updated = await prisma.contentCalendarEntry.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
      ...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.publishedUrl !== undefined ? { publishedUrl: input.publishedUrl } : {}),
      ...(input.scheduledDate !== undefined ? { scheduledDate: new Date(input.scheduledDate) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
    },
    include: INCLUDE,
  });
  return mapToDto(updated);
}

export async function deleteContentCalendarEntry(id: string, deletedBy: string): Promise<void> {
  await loadOpen(id);
  await prisma.contentCalendarEntry.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), deletedBy } });
}
