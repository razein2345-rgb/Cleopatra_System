import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { Campaign, CreateCampaignInput, UpdateCampaignInput } from '@cleopatra/shared';

const INCLUDE = {
  recordedBy: { select: { name: true } },
} satisfies Prisma.CampaignInclude;

type CampaignRecord = Prisma.CampaignGetPayload<{ include: typeof INCLUDE }>;

export class CampaignNotFoundError extends Error {
  constructor() {
    super('الحملة غير موجودة');
    this.name = 'CampaignNotFoundError';
  }
}

function mapToDto(row: CampaignRecord): Campaign {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    status: row.status,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    budget: row.budget?.toNumber() ?? null,
    leadsGenerated: row.leadsGenerated,
    quotesGenerated: row.quotesGenerated,
    ordersGenerated: row.ordersGenerated,
    revenue: row.revenue?.toNumber() ?? null,
    notes: row.notes,
    branchId: row.branchId,
    recordedById: row.recordedById,
    recordedByName: row.recordedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCampaigns(filter: { branchIds?: string[] }): Promise<Campaign[]> {
  const rows = await prisma.campaign.findMany({
    where: {
      isDeleted: false,
      ...(filter.branchIds ? { OR: [{ branchId: { in: filter.branchIds } }, { branchId: null }] } : {}),
    },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapToDto);
}

export async function createCampaign(input: CreateCampaignInput, staffId: string): Promise<Campaign> {
  const created = await prisma.campaign.create({
    data: {
      name: input.name,
      channel: input.channel,
      status: input.status ?? 'DRAFT',
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      budget: input.budget ?? null,
      notes: input.notes ?? null,
      branchId: input.branchId ?? null,
      recordedById: staffId,
    },
    include: INCLUDE,
  });
  return mapToDto(created);
}

async function loadOpen(id: string): Promise<CampaignRecord> {
  const row = await prisma.campaign.findUnique({ where: { id }, include: INCLUDE });
  if (!row || row.isDeleted) throw new CampaignNotFoundError();
  return row;
}

export async function updateCampaign(id: string, input: UpdateCampaignInput): Promise<Campaign> {
  await loadOpen(id);
  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(input.endDate) : null } : {}),
      ...(input.budget !== undefined ? { budget: input.budget } : {}),
      ...(input.leadsGenerated !== undefined ? { leadsGenerated: input.leadsGenerated } : {}),
      ...(input.quotesGenerated !== undefined ? { quotesGenerated: input.quotesGenerated } : {}),
      ...(input.ordersGenerated !== undefined ? { ordersGenerated: input.ordersGenerated } : {}),
      ...(input.revenue !== undefined ? { revenue: input.revenue } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
    },
    include: INCLUDE,
  });
  return mapToDto(updated);
}

export async function deleteCampaign(id: string, deletedBy: string): Promise<void> {
  await loadOpen(id);
  await prisma.campaign.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), deletedBy } });
}
