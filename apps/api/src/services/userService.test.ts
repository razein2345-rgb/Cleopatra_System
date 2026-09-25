import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({ prisma: {} }));

const { mapStaffToUser } = await import('./userService.js');

/**
 * `isDeviceAccount` (owner decision, 2026-09-25): the attendance kiosk terminals are logins, not people,
 * and must never be offered as an employee to assign a lead or a content item to. A device account is one
 * whose ONLY permission is `attendance.kiosk`; a real employee who merely also holds the kiosk role is not.
 */
function role(name: string, permissionKeys: string[]) {
  return {
    role: {
      id: `role-${name}`,
      name,
      label: name,
      description: null,
      isSystem: false,
      permissions: permissionKeys.map((key) => ({ permission: { key } })),
    },
  };
}

function staff(roles: ReturnType<typeof role>[]) {
  return {
    id: 's1',
    name: 'موظف',
    email: 'e@x.test',
    phone: null,
    isActive: true,
    lastLoginAt: null,
    lastActiveAt: null,
    branchId: 'b1',
    roles,
    branchAccess: [],
    position: null,
    hireDate: null,
    payFrequency: null,
    baseSalary: null,
    payDayOfMonth: null,
    shiftStartTime: null,
    shiftEndTime: null,
    workingDays: [],
    createdAt: new Date('2026-09-01T00:00:00Z'),
  } as never;
}

describe('mapStaffToUser - isDeviceAccount', () => {
  it('a login whose only role grants only attendance.kiosk is a device account', () => {
    expect(mapStaffToUser(staff([role('KIOSK', ['attendance.kiosk'])])).isDeviceAccount).toBe(true);
  });

  it('two roles that together grant nothing but the kiosk permission are still a device account', () => {
    expect(mapStaffToUser(staff([role('KIOSK_A', ['attendance.kiosk']), role('KIOSK_B', ['attendance.kiosk'])])).isDeviceAccount).toBe(true);
  });

  it('an employee who ALSO holds the kiosk role next to real roles is a person, not a device', () => {
    expect(mapStaffToUser(staff([role('KIOSK', ['attendance.kiosk']), role('SALES', ['orders.view', 'partners.view'])])).isDeviceAccount).toBe(false);
  });

  it('an ordinary employee, and an account with no permissions at all, are not device accounts', () => {
    expect(mapStaffToUser(staff([role('SALES', ['orders.view'])])).isDeviceAccount).toBe(false);
    expect(mapStaffToUser(staff([])).isDeviceAccount).toBe(false);
    expect(mapStaffToUser(staff([role('EMPTY', [])])).isDeviceAccount).toBe(false);
  });

  it('the rest of the user shape is unchanged (roles are still mapped without their permissions)', () => {
    const user = mapStaffToUser(staff([role('KIOSK', ['attendance.kiosk'])]));
    expect(user.roles).toEqual([{ id: 'role-KIOSK', name: 'KIOSK', label: 'KIOSK', description: null, isSystem: false }]);
    expect(user.accessibleBranchIds).toEqual(['b1']);
  });
});
