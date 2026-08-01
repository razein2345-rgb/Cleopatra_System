import { NavLink, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

const NAV_ITEMS: Array<{ to: string; label: string; permission?: string }> = [
  { to: '/', label: 'Dashboard' },
  { to: '/settings', label: 'Settings', permission: 'settings.view' },
  { to: '/users', label: 'Users', permission: 'employees.view' },
  { to: '/roles', label: 'Roles', permission: 'roles.view' },
  { to: '/permissions', label: 'Permissions', permission: 'permissions.view' },
];

export function AppShell() {
  const { authContext, can, signOut } = useAuth();

  return (
    <div className="min-h-svh">
      <header className="border-border bg-card flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-bold">Cleopatra System</span>
          <nav className="flex gap-4 text-sm">
            {NAV_ITEMS.filter((item) => !item.permission || can(item.permission)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  isActive
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{authContext?.user.name}</span>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
