import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateDocumentTemplateInput,
  DocumentTemplate,
  DocumentType,
  UpdateDocumentTemplateInput,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { setExclusiveDefaultByKey } from './partnerChildEntity.js';

type DocumentTemplateRecord = Prisma.DocumentTemplateGetPayload<{
  include: { nextVersion: { select: { id: true } } };
}>;

const INCLUDE = { nextVersion: { select: { id: true } } } satisfies Prisma.DocumentTemplateInclude;

export function mapDocumentTemplateToDto(record: DocumentTemplateRecord): DocumentTemplate {
  return {
    id: record.id,
    documentType: record.documentType,
    name: record.name,
    config: (record.config as Record<string, unknown>) ?? {},
    isDefault: record.isDefault,
    version: record.version,
    previousVersionId: record.previousVersionId,
    nextVersionExists: record.nextVersion !== null,
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class DocumentTemplateNotFoundError extends Error {
  constructor() {
    super('Document template not found');
    this.name = 'DocumentTemplateNotFoundError';
  }
}

export class TemplateAlreadyPublishedError extends Error {
  constructor() {
    super('A published template version cannot be edited — create a new version instead');
    this.name = 'TemplateAlreadyPublishedError';
  }
}

export class TemplateNotPublishedError extends Error {
  constructor() {
    super('Only a published template version may be set as default');
    this.name = 'TemplateNotPublishedError';
  }
}

export class TemplateInUseError extends Error {
  constructor() {
    super('This template version is used by at least one existing document and cannot be deleted');
    this.name = 'TemplateInUseError';
  }
}

export async function listDocumentTemplates(documentType?: DocumentType): Promise<DocumentTemplate[]> {
  const records = await prisma.documentTemplate.findMany({
    where: { isDeleted: false, ...(documentType ? { documentType } : {}) },
    include: INCLUDE,
    orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }],
  });
  return records.map(mapDocumentTemplateToDto);
}

export async function getDocumentTemplate(id: string): Promise<DocumentTemplate | null> {
  const record = await prisma.documentTemplate.findUnique({ where: { id }, include: INCLUDE });
  if (!record || record.isDeleted) return null;
  return mapDocumentTemplateToDto(record);
}

/** A brand-new, independent template chain — version 1, draft, not yet default. */
export async function createDocumentTemplate(input: CreateDocumentTemplateInput): Promise<DocumentTemplate> {
  const created = await prisma.documentTemplate.create({
    data: { documentType: input.documentType, name: input.name, config: input.config as Prisma.InputJsonValue },
    include: INCLUDE,
  });
  return mapDocumentTemplateToDto(created);
}

/**
 * "Duplicate template" (Requirement 13) — a brand-new, independent chain
 * copying the source's current `config`, never a version of the source
 * (duplicating is not editing).
 */
export async function duplicateDocumentTemplate(id: string, newName: string): Promise<DocumentTemplate> {
  const source = await prisma.documentTemplate.findUnique({ where: { id } });
  if (!source || source.isDeleted) throw new DocumentTemplateNotFoundError();

  const created = await prisma.documentTemplate.create({
    data: { documentType: source.documentType, name: newName, config: source.config ?? {} },
    include: INCLUDE,
  });
  return mapDocumentTemplateToDto(created);
}

/** Only legal while still a draft — editing a published version would silently alter historical documents that reference it. */
export async function updateDocumentTemplate(
  id: string,
  input: UpdateDocumentTemplateInput,
): Promise<DocumentTemplate> {
  const existing = await prisma.documentTemplate.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new DocumentTemplateNotFoundError();
  if (existing.publishedAt) throw new TemplateAlreadyPublishedError();

  const updated = await prisma.documentTemplate.update({
    where: { id },
    data: { name: input.name, config: input.config as Prisma.InputJsonValue | undefined },
    include: INCLUDE,
  });
  return mapDocumentTemplateToDto(updated);
}

/**
 * "Edit" a published template = create a new version (new row, version+1,
 * `previousVersionId` pointing back, starts as a fresh draft) — the exact
 * `WorkflowTemplate` versioning shape (FEATURE-004), reused here per
 * decision #16 rather than reinvented.
 */
export async function createTemplateVersion(id: string): Promise<DocumentTemplate> {
  const existing = await prisma.documentTemplate.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new DocumentTemplateNotFoundError();

  const created = await prisma.documentTemplate.create({
    data: {
      documentType: existing.documentType,
      name: existing.name,
      config: existing.config ?? {},
      version: existing.version + 1,
      previousVersionId: existing.id,
    },
    include: INCLUDE,
  });
  return mapDocumentTemplateToDto(created);
}

export async function publishDocumentTemplate(id: string): Promise<DocumentTemplate> {
  const existing = await prisma.documentTemplate.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new DocumentTemplateNotFoundError();
  if (existing.publishedAt) throw new TemplateAlreadyPublishedError();

  const updated = await prisma.documentTemplate.update({
    where: { id },
    data: { publishedAt: new Date() },
    include: INCLUDE,
  });
  return mapDocumentTemplateToDto(updated);
}

/**
 * "Exactly one default per documentType" — generalized exclusivity-lock
 * (decision #5), not a parallel implementation of `setExclusiveDefault`.
 * Only a published version may become the default — a draft can't be the
 * thing new documents are printed with.
 */
export async function setDefaultDocumentTemplate(id: string): Promise<DocumentTemplate> {
  const existing = await prisma.documentTemplate.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new DocumentTemplateNotFoundError();
  if (!existing.publishedAt) throw new TemplateNotPublishedError();

  const updated = await setExclusiveDefaultByKey({
    lockKey: `document-template-default:${existing.documentType}`,
    unsetOthers: (tx) =>
      tx.documentTemplate.updateMany({
        where: { documentType: existing.documentType, isDefault: true, isDeleted: false },
        data: { isDefault: false },
      }),
    setTarget: (tx) =>
      tx.documentTemplate.update({ where: { id }, data: { isDefault: true }, include: INCLUDE }),
  });
  return mapDocumentTemplateToDto(updated);
}

/** Blocked (not soft-deleted) if any Quotation/Order/WorkOrder still references this exact version — the delete-protection rule from 01_ANALYSIS.md §9.2. */
export async function assertTemplateNotInUse(id: string): Promise<void> {
  const [quotationCount, orderCount, workOrderCount] = await Promise.all([
    prisma.quotation.count({ where: { documentTemplateId: id, isDeleted: false } }),
    prisma.order.count({ where: { documentTemplateId: id, isDeleted: false } }),
    prisma.workOrder.count({ where: { documentTemplateId: id, isDeleted: false } }),
  ]);
  if (quotationCount + orderCount + workOrderCount > 0) {
    throw new TemplateInUseError();
  }
}

export async function deleteDocumentTemplate(id: string, deletedBy: string): Promise<void> {
  const existing = await prisma.documentTemplate.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new DocumentTemplateNotFoundError();

  await assertTemplateNotInUse(id);

  await prisma.documentTemplate.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy },
  });
}
