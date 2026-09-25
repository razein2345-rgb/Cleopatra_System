import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the communication-hub controller (CRM review, 2026-09-25). The hub
 * is company-wide by design (no branch), reads are open to any signed-in user and the writes are
 * gated at the router by `settings.edit`; what the controller itself owns - and what is locked
 * here - is that every write is audited, a missing link is a clean 404 with nothing audited, and
 * a bad body is rejected before anything is written.
 */

const listLinks = vi.fn();
const createLink = vi.fn();
const updateLink = vi.fn();
const moveLink = vi.fn();
const deleteLink = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/communicationHubLinkService.js', () => ({
  listCommunicationHubLinks: listLinks,
  createCommunicationHubLink: createLink,
  updateCommunicationHubLink: updateLink,
  moveCommunicationHubLink: moveLink,
  deleteCommunicationHubLink: deleteLink,
  CommunicationHubLinkNotFoundError: class CommunicationHubLinkNotFoundError extends Error {},
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const handlers = await import('./communicationHubLinks.js');

const LINK_ID = '11111111-1111-1111-1111-111111111111';
const auth = { staffId: 'staff-1' };

function makeRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('create / update / delete are audited', () => {
  it('create: 201 and an audit row with the new link', async () => {
    createLink.mockResolvedValue({ id: LINK_ID, label: 'واتساب', url: 'wa.me/201000000000', sortOrder: 0 });
    const res = makeRes();
    await handlers.createCommunicationHubLinkHandler({ body: { label: 'واتساب', url: 'wa.me/201000000000' }, auth } as never, res as never);
    expect(res.statusCode).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'CommunicationHubLink', action: 'CREATE', entityId: LINK_ID }));
  });

  it('a body missing the label or url is rejected and nothing is written', async () => {
    await expect(handlers.createCommunicationHubLinkHandler({ body: { label: '', url: 'x' }, auth } as never, makeRes() as never)).rejects.toThrow();
    await expect(handlers.createCommunicationHubLinkHandler({ body: { label: 'x' }, auth } as never, makeRes() as never)).rejects.toThrow();
    expect(createLink).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('update: audited; a missing link is 404 and nothing is audited', async () => {
    updateLink.mockResolvedValue({ id: LINK_ID });
    await handlers.updateCommunicationHubLinkHandler({ params: { id: LINK_ID }, body: { label: 'جديد' }, auth } as never, makeRes() as never);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }));

    recordAudit.mockClear();
    const { CommunicationHubLinkNotFoundError } = await import('../services/communicationHubLinkService.js');
    updateLink.mockRejectedValue(new (CommunicationHubLinkNotFoundError as new () => Error)());
    const res = makeRes();
    await handlers.updateCommunicationHubLinkHandler({ params: { id: LINK_ID }, body: { label: 'جديد' }, auth } as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('delete: audited; a missing link is 404 and nothing is audited', async () => {
    deleteLink.mockResolvedValue(undefined);
    await handlers.deleteCommunicationHubLinkHandler({ params: { id: LINK_ID }, auth } as never, makeRes() as never);
    expect(deleteLink).toHaveBeenCalledWith(LINK_ID, 'staff-1');
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', entityId: LINK_ID }));

    recordAudit.mockClear();
    const { CommunicationHubLinkNotFoundError } = await import('../services/communicationHubLinkService.js');
    deleteLink.mockRejectedValue(new (CommunicationHubLinkNotFoundError as new () => Error)());
    const res = makeRes();
    await handlers.deleteCommunicationHubLinkHandler({ params: { id: LINK_ID }, auth } as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('move / list', () => {
  it('move answers with the re-ordered list; an unknown link is 404', async () => {
    moveLink.mockResolvedValue(undefined);
    listLinks.mockResolvedValue([{ id: LINK_ID }]);
    const ok = makeRes();
    await handlers.moveCommunicationHubLinkHandler({ params: { id: LINK_ID }, body: { direction: 'up' } } as never, ok as never);
    expect(moveLink).toHaveBeenCalledWith(LINK_ID, 'up');
    expect(ok.body).toMatchObject({ success: true, data: [{ id: LINK_ID }] });

    const { CommunicationHubLinkNotFoundError } = await import('../services/communicationHubLinkService.js');
    moveLink.mockRejectedValue(new (CommunicationHubLinkNotFoundError as new () => Error)());
    const missing = makeRes();
    await handlers.moveCommunicationHubLinkHandler({ params: { id: LINK_ID }, body: { direction: 'down' } } as never, missing as never);
    expect(missing.statusCode).toBe(404);
  });

  it('list returns every link (open to any signed-in user by design - no branch scoping here)', async () => {
    listLinks.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const res = makeRes();
    await handlers.listCommunicationHubLinksHandler({} as never, res as never);
    expect(res.body).toMatchObject({ success: true, data: [{ id: 'a' }, { id: 'b' }] });
  });
});
