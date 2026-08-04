import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/state/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/login/LoginPage';
import { AcceptInvitePage } from '@/pages/accept-invite/AcceptInvitePage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { UsersPage } from '@/pages/users/UsersPage';
import { RolesPage } from '@/pages/roles/RolesPage';
import { PermissionsPage } from '@/pages/permissions/PermissionsPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />

              <Route element={<ProtectedRoute permission="settings.view" />}>
                <Route
                  path="/settings"
                  element={
                    <div dir="rtl">
                      <SettingsPage />
                    </div>
                  }
                />
              </Route>

              <Route element={<ProtectedRoute permission="employees.view" />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>

              <Route element={<ProtectedRoute permission="roles.view" />}>
                <Route path="/roles" element={<RolesPage />} />
              </Route>

              <Route element={<ProtectedRoute permission="permissions.view" />}>
                <Route path="/permissions" element={<PermissionsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
