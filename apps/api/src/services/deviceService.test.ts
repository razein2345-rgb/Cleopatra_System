import { describe, expect, it, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const findMany = vi.fn();
const settingFindFirst = vi.fn();
const recordAudit = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    trustedDevice: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
    setting: {
      findFirst: (...args: unknown[]) => settingFindFirst(...args),
    },
  },
}));

vi.mock('./auditService.js', () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

const { resolveDeviceAccess, logoutAllDevices } = await import('./deviceService.js');

function device(overrides: Partial<{ id: string; deviceToken: string; status: string; staffId: string | null; lastActiveAt: Date | null; isDeleted: boolean }> = {}) {
  return {
    id: 'device-1',
    deviceToken: 'token-a',
    status: 'ACTIVE',
    staffId: 'staff-1',
    lastActiveAt: new Date(),
    isDeleted: false,
    ...overrides,
  };
}

describe('resolveDeviceAccess', () => {
  beforeEach(() => {
    findUnique.mockReset();
    create.mockReset();
    update.mockReset();
    updateMany.mockReset();
    findMany.mockReset();
    settingFindFirst.mockReset();
    recordAudit.mockReset();
    update.mockResolvedValue(device());
  });

  it('scenario 1: user + approved device -> succeeds', async () => {
    findUnique.mockResolvedValue(device({ status: 'ACTIVE', staffId: 'staff-1' }));
    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'staff-1' })).resolves.toBeUndefined();
  });

  it('scenario 2: user + unapproved (PENDING) device -> denied with PENDING', async () => {
    findUnique.mockResolvedValue(device({ status: 'PENDING' }));
    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'staff-1' })).rejects.toMatchObject({
      reason: 'PENDING',
    });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UNAUTHORIZED_DEVICE_ATTEMPT', newValue: { reason: 'PENDING' } }));
  });

  it('scenario 3: blocked device -> denied with BLOCKED even with correct credentials', async () => {
    findUnique.mockResolvedValue(device({ status: 'BLOCKED' }));
    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'staff-1' })).rejects.toMatchObject({
      reason: 'BLOCKED',
    });
  });

  it('scenario 4: approved device then admin blocks it -> the very next request is denied', async () => {
    findUnique.mockResolvedValueOnce(device({ status: 'ACTIVE' }));
    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'staff-1' })).resolves.toBeUndefined();

    findUnique.mockResolvedValueOnce(device({ status: 'BLOCKED' }));
    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'staff-1' })).rejects.toMatchObject({
      reason: 'BLOCKED',
    });
  });

  it('scenario 5: admin unblocks -> device can access again', async () => {
    findUnique.mockResolvedValueOnce(device({ status: 'BLOCKED' }));
    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'staff-1' })).rejects.toMatchObject({
      reason: 'BLOCKED',
    });

    findUnique.mockResolvedValueOnce(device({ status: 'ACTIVE' }));
    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'staff-1' })).resolves.toBeUndefined();
  });

  it('scenario 7: staff has device A (approved) and device B (blocked) -> only A works', async () => {
    findUnique.mockImplementation(({ where }: { where: { deviceToken: string } }) =>
      Promise.resolve(
        where.deviceToken === 'token-a'
          ? device({ deviceToken: 'token-a', status: 'ACTIVE' })
          : device({ id: 'device-2', deviceToken: 'token-b', status: 'BLOCKED' }),
      ),
    );

    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'staff-1' })).resolves.toBeUndefined();
    await expect(resolveDeviceAccess({ deviceToken: 'token-b', userAgent: 'ua', staffId: 'staff-1' })).rejects.toMatchObject({
      reason: 'BLOCKED',
    });
  });

  it('a Policy B device bound to another staff member denies access even with a valid session', async () => {
    findUnique.mockResolvedValue(device({ status: 'ACTIVE', staffId: 'someone-else' }));
    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'staff-1' })).rejects.toMatchObject({
      reason: 'WRONG_STAFF',
    });
  });

  it('a Policy A device (staffId null) is usable by any staff member', async () => {
    findUnique.mockResolvedValue(device({ status: 'ACTIVE', staffId: null }));
    await expect(resolveDeviceAccess({ deviceToken: 'token-a', userAgent: 'ua', staffId: 'any-staff' })).resolves.toBeUndefined();
  });

  it('a missing device token is denied outright (MISSING)', async () => {
    await expect(resolveDeviceAccess({ deviceToken: undefined, userAgent: 'ua', staffId: 'staff-1' })).rejects.toMatchObject({
      reason: 'MISSING',
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('a brand-new device auto-activates when deviceAccessMode is ALLOW_ALL_REGISTERED (the default)', async () => {
    findUnique.mockResolvedValue(null);
    settingFindFirst.mockResolvedValue({ deviceAccessMode: 'ALLOW_ALL_REGISTERED' });
    create.mockResolvedValue(device({ status: 'ACTIVE' }));

    await expect(resolveDeviceAccess({ deviceToken: 'token-new', userAgent: 'Mozilla/5.0 Windows Chrome/1', staffId: 'staff-1' })).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
  });

  it('a brand-new device starts PENDING and is denied when deviceAccessMode is ONLY_APPROVED', async () => {
    findUnique.mockResolvedValue(null);
    settingFindFirst.mockResolvedValue({ deviceAccessMode: 'ONLY_APPROVED' });
    create.mockResolvedValue(device({ status: 'PENDING' }));

    await expect(resolveDeviceAccess({ deviceToken: 'token-new', userAgent: 'ua', staffId: 'staff-1' })).rejects.toMatchObject({
      reason: 'PENDING',
    });
  });
});

describe('logoutAllDevices (scenario 6)', () => {
  beforeEach(() => {
    findMany.mockReset();
    updateMany.mockReset();
    recordAudit.mockReset();
  });

  it('blocks every active Policy B device bound to the staff member', async () => {
    findMany.mockResolvedValue([{ id: 'device-1' }, { id: 'device-2' }]);
    updateMany.mockResolvedValue({ count: 2 });

    const blockedCount = await logoutAllDevices('staff-1', 'actor-1');

    expect(blockedCount).toBe(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['device-1', 'device-2'] } },
        data: expect.objectContaining({ status: 'BLOCKED' }),
      }),
    );
  });

  it('does nothing when the staff member has no active devices', async () => {
    findMany.mockResolvedValue([]);

    const blockedCount = await logoutAllDevices('staff-1', 'actor-1');

    expect(blockedCount).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
