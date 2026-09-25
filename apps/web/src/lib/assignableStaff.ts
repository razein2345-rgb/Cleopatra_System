import type { User } from '@cleopatra/shared';

/**
 * Who may be offered as "المسؤول" (owner decision, 2026-09-25): active employees only. A device login
 * (the attendance kiosk terminals) is not a person - assigning a lead's follow-up to it means the
 * follow-up is never done. `isDeviceAccount` is computed by the API from the account's permissions
 * (only `attendance.kiosk`), so an employee who merely also holds the kiosk role is still offered.
 */
export function assignableStaff(users: User[]): User[] {
  return users.filter((u) => u.isActive && !u.isDeviceAccount);
}
