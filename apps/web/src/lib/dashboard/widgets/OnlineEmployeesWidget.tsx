import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import type { User } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/state/AuthContext';
import { isOnlineNow } from '@/lib/onlineStatus';
import type { DashboardWidgetDefinition } from '../types';

/**
 * Owner (2026-08-20, "محتاج اشوف مين الموظف الأكتيف على السيستم" → "محتاجها
 * تظهرلي في الداشبورد كمسئول عام") — `isOnlineNow` is shared with
 * `UsersPage.tsx` (see `lib/onlineStatus.ts`) so "online" is defined in one
 * place only. Owner-only, same self-gating pattern
 * `FinancialOverviewWidget.tsx` already uses (no role-aware field on
 * `DashboardWidgetDefinition` itself).
 */
const AUTO_REFRESH_MS = 30_000;

function OnlineEmployeesWidgetComponent() {
  const { authContext } = useAuth();
  const isOwner = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN' || r.name === 'ADMIN') ?? false;

  const [users, setUsers] = useState<User[] | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    const load = () => apiGet<User[]>('/api/users').then(setUsers).catch(() => undefined);
    load();
    const interval = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [isOwner]);

  if (!isOwner) return null;

  const onlineUsers = users?.filter(isOnlineNow) ?? [];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">متصل الآن</span>
      </div>
      {!users ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : onlineUsers.length === 0 ? (
        <p className="text-muted-foreground text-sm">لا يوجد أحد متصل حاليًا.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {onlineUsers.map((u) => (
            <span key={u.id} className="bg-success/10 text-success flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm">
              <span className="bg-success size-1.5 rounded-full" />
              {u.name}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export const onlineEmployeesWidget: DashboardWidgetDefinition = {
  id: 'online-employees',
  permission: 'employees.view',
  Component: OnlineEmployeesWidgetComponent,
};
