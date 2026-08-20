import { UserCog } from 'lucide-react';
import type { User } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import type { SearchProvider } from '../types';

export const employeesProvider: SearchProvider = {
  id: 'employees',
  groupLabel: 'الموظفين',
  permission: 'employees.view',
  async fetch() {
    const users = await apiGet<User[]>('/api/users');
    return users.map((u) => ({
      id: u.id,
      label: u.position ? `${u.name} — ${u.position}` : u.name,
      value: `${u.name} ${u.email} ${u.phone ?? ''}`,
      icon: UserCog,
      to: `/users/${u.id}`,
    }));
  },
};
