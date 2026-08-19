import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/state/AuthContext';
import { ThemeProvider } from '@/state/ThemeContext';
import { ConfirmProvider } from '@/components/cleopatra';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/login/LoginPage';
import { AcceptInvitePage } from '@/pages/accept-invite/AcceptInvitePage';
import { RoleHome } from '@/pages/dashboard/RoleHome';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { AuditLogPage } from '@/pages/settings/AuditLogPage';
import { UsersPage } from '@/pages/users/UsersPage';
import { EmployeeProfilePage } from '@/pages/users/EmployeeProfilePage';
import { EmployeeAdvancesReportPage } from '@/pages/users/EmployeeAdvancesReportPage';
import { RolesPage } from '@/pages/roles/RolesPage';
import { PermissionsPage } from '@/pages/permissions/PermissionsPage';
import { PartnersPage } from '@/pages/partners/PartnersPage';
import { PartnerProfilePage } from '@/pages/partners/PartnerProfilePage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { QuotationDetailPage } from '@/pages/quotations/QuotationDetailPage';
import { QuotationDocumentPage } from '@/pages/quotations/QuotationDocumentPage';
import { NewOrderPage } from '@/pages/orders/NewOrderPage';
import { OrderDocumentPage } from '@/pages/orders/OrderDocumentPage';
import { WorkOrderDocumentPage } from '@/pages/orders/WorkOrderDocumentPage';
import { TreasuryPage } from '@/pages/treasury/TreasuryPage';
import { InventoryPage } from '@/pages/inventory/InventoryPage';
import { ProductionBoardPage } from '@/pages/production-board/ProductionBoardPage';
import { WorkOrderTimelinePage } from '@/pages/production-board/WorkOrderTimelinePage';
import { MachinesPage } from '@/pages/production-board/MachinesPage';
import { KioskPage } from '@/pages/attendance/KioskPage';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ConfirmProvider>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<RoleHome />} />

              <Route element={<ProtectedRoute permission="settings.view" />}>
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/:categoryId" element={<SettingsPage />} />
              </Route>

              {/* Owner ("مفيش شاشة لعرض الـAudit Log نفسه") — SUPER_ADMIN-only,
                  enforced inside the component itself (same pattern as
                  EmployeeProfilePage's attendance/payroll gate), not via a
                  `permission` prop since this isn't in the permission catalog. */}
              <Route path="/audit-log" element={<AuditLogPage />} />

              <Route element={<ProtectedRoute permission="employees.view" />}>
                <Route path="/users" element={<UsersPage />} />
                <Route path="/users/advances-report" element={<EmployeeAdvancesReportPage />} />
                <Route path="/users/:id" element={<EmployeeProfilePage />} />
              </Route>

              <Route element={<ProtectedRoute permission="partners.view" />}>
                <Route path="/partners" element={<PartnersPage />} />
                <Route path="/partners/:id" element={<PartnerProfilePage />} />
              </Route>

              {/* FEATURE-007 — "المستندات": unified Quotations/Orders/WorkOrders list. */}
              <Route element={<ProtectedRoute permission="quotations.view" />}>
                <Route path="/quotations" element={<DocumentsPage />} />
                <Route path="/quotations/:id" element={<QuotationDetailPage />} />
                {/* FEATURE-006 M8 — Quotation document (print), same pattern as OrderDocumentPage. */}
                <Route path="/quotations/:id/print" element={<QuotationDocumentPage />} />
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

              {/* FEATURE-006 M10 — Work Order document (print). */}
              <Route element={<ProtectedRoute permission="work-orders.view" />}>
                <Route path="/work-orders/:id" element={<WorkOrderDocumentPage />} />
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

              <Route element={<ProtectedRoute permission="machines.view" />}>
                <Route path="/machines" element={<MachinesPage />} />
              </Route>

              <Route element={<ProtectedRoute permission="roles.view" />}>
                <Route path="/roles" element={<RolesPage />} />
              </Route>

              <Route element={<ProtectedRoute permission="permissions.view" />}>
                <Route path="/permissions" element={<PermissionsPage />} />
              </Route>
            </Route>
          </Route>

          {/* FEATURE-013 (2026-08-14) — لوحة الكشك: standalone, no AppShell
              sidebar/nav — the shared tablet stays on this one screen all
              day, logged into a dedicated Kiosk account. */}
          <Route element={<ProtectedRoute permission="attendance.kiosk" />}>
            <Route path="/attendance/kiosk" element={<KioskPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
