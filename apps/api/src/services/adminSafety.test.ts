import { describe, expect, it, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const count = vi.fn();
const recordAudit = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    staffProfile: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      count: (...args: unknown[]) => count(...args),
    },
  },
}));

vi.mock('./auditService.js', () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

const { AdminSafetyService, hasAdminRole, LastActiveAdminError, wouldOrphanAdministrators } =
  await import('./adminSafety.js');

function staff(overrides: Partial<{ isActive: boolean; isDeleted: boolean; roleNames: string[] }> = {}) {
  const { isActive = true, isDeleted = false, roleNames = ['ADMIN'] } = overrides;
  return {
    id: 'staff-1',
    branchId: 'branch-1',
    isActive,
    isDeleted,
    roles: roleNames.map((name) => ({ role: { name } })),
  };
}

function assertNotLastActiveAdmin(
  staffId: string,
  willRemainActiveAdmin: boolean,
  performedById = 'actor-1',
  operation: 'DEACTIVATE' | 'DELETE' | 'REMOVE_ADMIN_ROLE' = 'DEACTIVATE',
) {
  return AdminSafetyService.assertNotLastActiveAdmin({
    staffId,
    willRemainActiveAdmin,
    performedById,
    operation,
  });
}

describe('wouldOrphanAdministrators (pure decision)', () => {
  it('allows the change when the staff member is not currently an active admin', () => {
    expect(wouldOrphanAdministrators(false, false, 0)).toBe(false);
  });

  it('allows the change when the staff member will still be an active admin afterward', () => {
    expect(wouldOrphanAdministrators(true, true, 0)).toBe(false);
  });

  it('allows the change when other active admins remain', () => {
    expect(wouldOrphanAdministrators(true, false, 1)).toBe(false);
  });

  it('rejects the change when it would leave zero active admins', () => {
    expect(wouldOrphanAdministrators(true, false, 0)).toBe(true);
  });
});

describe('hasAdminRole', () => {
  it('recognizes ADMIN and SUPER_ADMIN as administrator roles', () => {
    expect(hasAdminRole(['ADMIN'])).toBe(true);
    expect(hasAdminRole(['SUPER_ADMIN'])).toBe(true);
    expect(hasAdminRole(['SALES', 'SUPER_ADMIN'])).toBe(true);
  });

  it('rejects role sets with no administrator role', () => {
    expect(hasAdminRole([])).toBe(false);
    expect(hasAdminRole(['SALES', 'VIEWER'])).toBe(false);
  });
});

describe('AdminSafetyService.assertNotLastActiveAdmin', () => {
  beforeEach(() => {
    findUnique.mockReset();
    count.mockReset();
    recordAudit.mockReset();
  });

  it('rejects deactivating the last active administrator', async () => {
    findUnique.mockResolvedValue(staff({ roleNames: ['ADMIN'] }));
    count.mockResolvedValue(0);

    await expect(assertNotLastActiveAdmin('staff-1', false)).rejects.toThrow(LastActiveAdminError);
  });

  it('allows deactivating an administrator when another active administrator remains', async () => {
    findUnique.mockResolvedValue(staff({ roleNames: ['ADMIN'] }));
    count.mockResolvedValue(1);

    await expect(assertNotLastActiveAdmin('staff-1', false)).resolves.toBeUndefined();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('allows deactivating a non-administrator regardless of admin headcount', async () => {
    findUnique.mockResolvedValue(staff({ roleNames: ['SALES'] }));
    count.mockResolvedValue(0);

    await expect(assertNotLastActiveAdmin('staff-1', false)).resolves.toBeUndefined();
    expect(count).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('allows a role change that keeps the staff member an active administrator', async () => {
    findUnique.mockResolvedValue(staff({ roleNames: ['ADMIN'] }));
    count.mockResolvedValue(0);

    await expect(assertNotLastActiveAdmin('staff-1', true)).resolves.toBeUndefined();
    expect(count).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('rejects a role change that strips the last active administrator of every admin role', async () => {
    findUnique.mockResolvedValue(staff({ roleNames: ['SUPER_ADMIN'] }));
    count.mockResolvedValue(0);

    await expect(
      assertNotLastActiveAdmin('staff-1', false, 'actor-1', 'REMOVE_ADMIN_ROLE'),
    ).rejects.toThrow(LastActiveAdminError);
  });

  it('does nothing when the staff member does not exist', async () => {
    findUnique.mockResolvedValue(null);

    await expect(assertNotLastActiveAdmin('missing', false)).resolves.toBeUndefined();
    expect(count).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('records a SECURITY_REJECTION audit entry (reason LAST_ACTIVE_ADMIN) before throwing', async () => {
    findUnique.mockResolvedValue(staff({ roleNames: ['ADMIN'] }));
    count.mockResolvedValue(0);

    await expect(
      assertNotLastActiveAdmin('staff-1', false, 'actor-42', 'DELETE'),
    ).rejects.toThrow(LastActiveAdminError);

    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'StaffProfile',
        entityId: 'staff-1',
        action: 'SECURITY_REJECTION',
        performedById: 'actor-42',
        branchId: 'branch-1',
        newValue: { reason: 'LAST_ACTIVE_ADMIN', operation: 'DELETE' },
      }),
    );
  });
});
