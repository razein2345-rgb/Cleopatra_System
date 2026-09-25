import { describe, expect, it } from 'vitest';
import type { User } from '@cleopatra/shared';
import { assignableStaff } from './assignableStaff';

function user(name: string, overrides: Partial<User> = {}): User {
  return { id: name, name, isActive: true, isDeviceAccount: false, ...overrides } as User;
}

describe('assignableStaff', () => {
  it('keeps active employees', () => {
    expect(assignableStaff([user('أحمد'), user('مريم')]).map((u) => u.name)).toEqual(['أحمد', 'مريم']);
  });

  it('drops kiosk device accounts', () => {
    const list = [user('عمر'), user('كشك برينتنج هاوس', { isDeviceAccount: true }), user('كشك كليوباترا', { isDeviceAccount: true })];
    expect(assignableStaff(list).map((u) => u.name)).toEqual(['عمر']);
  });

  it('drops inactive accounts', () => {
    expect(assignableStaff([user('نشط'), user('موقوف', { isActive: false })]).map((u) => u.name)).toEqual(['نشط']);
  });

  it('an employee who also holds the kiosk role is still offered (the API only flags accounts whose sole permission is the kiosk)', () => {
    expect(assignableStaff([user('محمد', { isDeviceAccount: false })]).map((u) => u.name)).toEqual(['محمد']);
  });

  it('an older API response without the flag drops nobody (the field is undefined, not true)', () => {
    const legacy = { id: 'x', name: 'كشك', isActive: true } as User;
    expect(assignableStaff([legacy])).toHaveLength(1);
  });
});
