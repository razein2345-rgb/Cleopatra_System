import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CommunicationHubLink, CreateCommunicationHubLinkInput, UpdateCommunicationHubLinkInput } from '@cleopatra/shared';

type CommunicationHubLinkRecord = Prisma.CommunicationHubLinkGetPayload<object>;

export class CommunicationHubLinkNotFoundError extends Error {
  constructor() {
    super('الرابط غير موجود');
    this.name = 'CommunicationHubLinkNotFoundError';
  }
}

function mapToDto(row: CommunicationHubLinkRecord): CommunicationHubLink {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCommunicationHubLinks(): Promise<CommunicationHubLink[]> {
  const rows = await prisma.communicationHubLink.findMany({ where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } });
  return rows.map(mapToDto);
}

export async function createCommunicationHubLink(input: CreateCommunicationHubLinkInput): Promise<CommunicationHubLink> {
  const maxOrder = await prisma.communicationHubLink.aggregate({ where: { isDeleted: false }, _max: { sortOrder: true } });
  const created = await prisma.communicationHubLink.create({
    data: { label: input.label, url: input.url, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
  });
  return mapToDto(created);
}

async function loadLink(id: string): Promise<CommunicationHubLinkRecord> {
  const link = await prisma.communicationHubLink.findUnique({ where: { id } });
  if (!link || link.isDeleted) throw new CommunicationHubLinkNotFoundError();
  return link;
}

export async function updateCommunicationHubLink(id: string, input: UpdateCommunicationHubLinkInput): Promise<CommunicationHubLink> {
  await loadLink(id);
  const updated = await prisma.communicationHubLink.update({ where: { id }, data: input });
  return mapToDto(updated);
}

/** Swaps this link's `sortOrder` with its immediate neighbor — a no-op at either edge of the list (already first/last). */
export async function moveCommunicationHubLink(id: string, direction: 'up' | 'down'): Promise<void> {
  const rows = await prisma.communicationHubLink.findMany({ where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } });
  const index = rows.findIndex((r) => r.id === id);
  if (index === -1) throw new CommunicationHubLinkNotFoundError();

  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) return;

  const current = rows[index];
  const neighbor = rows[swapIndex];
  await prisma.$transaction([
    prisma.communicationHubLink.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.communicationHubLink.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } }),
  ]);
}

export async function deleteCommunicationHubLink(id: string, deletedBy: string): Promise<void> {
  await loadLink(id);
  await prisma.communicationHubLink.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), deletedBy } });
}
