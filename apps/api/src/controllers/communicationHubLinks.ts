import type { Request, Response } from 'express';
import { createCommunicationHubLinkSchema, moveCommunicationHubLinkSchema, updateCommunicationHubLinkSchema } from '@cleopatra/shared';
import { recordAudit } from '../services/auditService.js';
import {
  CommunicationHubLinkNotFoundError,
  createCommunicationHubLink,
  deleteCommunicationHubLink,
  listCommunicationHubLinks,
  moveCommunicationHubLink,
  updateCommunicationHubLink,
} from '../services/communicationHubLinkService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof CommunicationHubLinkNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  return false;
}

export async function listCommunicationHubLinksHandler(_req: Request, res: Response) {
  res.json({ success: true, data: await listCommunicationHubLinks() });
}

export async function createCommunicationHubLinkHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createCommunicationHubLinkSchema.parse(req.body);
  const link = await createCommunicationHubLink(input);
  await recordAudit({ entityType: 'CommunicationHubLink', entityId: link.id, action: 'CREATE', performedById: auth.staffId, newValue: input });
  res.status(201).json({ success: true, data: link });
}

export async function updateCommunicationHubLinkHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateCommunicationHubLinkSchema.parse(req.body);

  try {
    const link = await updateCommunicationHubLink(req.params.id, input);
    await recordAudit({ entityType: 'CommunicationHubLink', entityId: link.id, action: 'UPDATE', performedById: auth.staffId, newValue: input });
    res.json({ success: true, data: link });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function moveCommunicationHubLinkHandler(req: Request<{ id: string }>, res: Response) {
  const input = moveCommunicationHubLinkSchema.parse(req.body);

  try {
    await moveCommunicationHubLink(req.params.id, input.direction);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
  res.json({ success: true, data: await listCommunicationHubLinks() });
}

export async function deleteCommunicationHubLinkHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;

  try {
    await deleteCommunicationHubLink(req.params.id, auth.staffId);
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }

  await recordAudit({ entityType: 'CommunicationHubLink', entityId: req.params.id, action: 'DELETE', performedById: auth.staffId });
  res.json({ success: true, data: { id: req.params.id } });
}
