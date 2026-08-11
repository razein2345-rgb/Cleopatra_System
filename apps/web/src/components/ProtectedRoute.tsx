import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/state/AuthContext';

/**
 * Client-side route gating for UX only (hide nav items, redirect to login).
 * This is never the actual authorization boundary — every API endpoint
 * re-checks permissions server-side against the database (see
 * `requirePermission` in apps/api), because client-side checks can always
 * be bypassed by whoever controls the client.
 */
export function ProtectedRoute({ permission }: { permission?: string | string[] }) {
  const { loading, authContext, can } = useAuth();

  if (loading) {
    return (
      <div className="text-muted-foreground flex min-h-svh items-center justify-center">
        جارٍ التحميل…
      </div>
    );
  }

  if (!authContext) {
    return <Navigate to="/login" replace />;
  }

  // A string requires that exact permission; an array is satisfied by holding any one of them.
  const permitted = !permission || (Array.isArray(permission) ? permission.some(can) : can(permission));
  if (!permitted) {
    return (
      <div className="flex min-h-svh items-center justify-center p-8 text-center">
        <div>
          <h1 className="mb-2 text-xl font-bold">الوصول مرفوض</h1>
          <p className="text-muted-foreground">لا تملك صلاحية لعرض هذه الصفحة.</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
