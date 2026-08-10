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
import { PartnersPage } from '@/pages/partners/PartnersPage';
import { PartnerProfilePage } from '@/pages/partners/PartnerProfilePage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { QuotationDetailPage } from '@/pages/quotations/QuotationDetailPage';
import { NewOrderPage } from '@/pages/orders/NewOrderPage';
import { OrderDocumentPage } from '@/pages/orders/OrderDocumentPage';
import { TreasuryPage } from '@/pages/treasury/TreasuryPage';
import { InventoryPage } from '@/pages/inventory/InventoryPage';
import { ProductionBoardPage } from '@/pages/production-board/ProductionBoardPage';
import { WorkOrderTimelinePage } from '@/pages/production-board/WorkOrderTimelinePage';

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
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/:categoryId" element={<SettingsPage />} />
              </Route>

              <Route element={<ProtectedRoute permission="employees.view" />}>
                <Route path="/users" element={<UsersPage />} />
              </Route>

              <Route element={<ProtectedRoute permission="partners.view" />}>
                <Route path="/partners" element={<PartnersPage />} />
                <Route path="/partners/:id" element={<PartnerProfilePage />} />
              </Route>

              {/* FEATURE-007 — "المستندات": unified Quotations/Orders/WorkOrders list. */}
              <Route element={<ProtectedRoute permission="quotations.view" />}>
                <Route path="/quotations" element={<DocumentsPage />} />
                <Route path="/quotations/:id" element={<QuotationDetailPage />} />
              </Route>

              {/* FEATURE-007 — "الطلبات والمستندات": unified creation screen, save
                  as Invoice (orders.create) or Quotation (quotations.create) —
                  either permission alone is enough to reach it. */}
              <Route element={<ProtectedRoute permission={['orders.create', 'quotations.create']} />}>
                <Route path="/orders/new" element={<NewOrderPage />} />
              </Route>

              {/* FEATURE-006 M9 — Invoice document (print). */}
              <Route element={<ProtectedRoute permission="orders.view" />}>
                <Route path="/orders/:id" element={<OrderDocumentPage />} />
              </Route>

              {/* FEATURE-006 M4 — Treasury as a first-class module.
                  FEATURE-007 M3 — treasury.create-only (reception) reaches
                  the same route; TreasuryPage itself renders the scoped view. */}
              <Route element={<ProtectedRoute permission={['treasury.view', 'treasury.create']} />}>
                <Route path="/treasury" element={<TreasuryPage />} />
              </Route>

              {/* FEATURE-007 M2 — Inventory as a first-class module. */}
              <Route element={<ProtectedRoute permission="inventory.view" />}>
                <Route path="/inventory" element={<InventoryPage />} />
              </Route>

              <Route element={<ProtectedRoute permission="work-orders.view" />}>
                <Route path="/production-board" element={<ProductionBoardPage />} />
                <Route path="/production-board/timeline/:workflowInstanceId" element={<WorkOrderTimelinePage />} />
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
