import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/state/AuthContext';
import { ThemeProvider } from '@/state/ThemeContext';
import { ConfirmProvider } from '@/components/cleopatra';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/login/LoginPage';
import { AcceptInvitePage } from '@/pages/accept-invite/AcceptInvitePage';
import { RoleHome } from '@/pages/dashboard/RoleHome';

/**
 * UX_PRODUCT_AUDIT.md § مشكلة 12.1 — every route used to be a static
 * top-of-file import, so a session that only ever touches the attendance
 * kiosk still downloaded the entire app (Settings, Treasury, Production
 * Board, everything) in one ~1.28MB bundle. `LoginPage`/`AcceptInvitePage`/
 * `RoleHome` stay eager — every session hits one of them first, so lazy-
 * loading them would only add a network round-trip with no benefit. Every
 * other route is its own chunk, loaded once actually navigated to.
 */
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AuditLogPage = lazy(() => import('@/pages/settings/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const UsersPage = lazy(() => import('@/pages/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const EmployeeProfilePage = lazy(() =>
  import('@/pages/users/EmployeeProfilePage').then((m) => ({ default: m.EmployeeProfilePage })),
);
const EmployeeAdvancesReportPage = lazy(() =>
  import('@/pages/users/EmployeeAdvancesReportPage').then((m) => ({ default: m.EmployeeAdvancesReportPage })),
);
const RolesPage = lazy(() => import('@/pages/roles/RolesPage').then((m) => ({ default: m.RolesPage })));
const PermissionsPage = lazy(() => import('@/pages/permissions/PermissionsPage').then((m) => ({ default: m.PermissionsPage })));
const PartnersPage = lazy(() => import('@/pages/partners/PartnersPage').then((m) => ({ default: m.PartnersPage })));
const PartnerProfilePage = lazy(() =>
  import('@/pages/partners/PartnerProfilePage').then((m) => ({ default: m.PartnerProfilePage })),
);
const DocumentsPage = lazy(() => import('@/pages/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const QuotationDetailPage = lazy(() =>
  import('@/pages/quotations/QuotationDetailPage').then((m) => ({ default: m.QuotationDetailPage })),
);
const QuotationDocumentPage = lazy(() =>
  import('@/pages/quotations/QuotationDocumentPage').then((m) => ({ default: m.QuotationDocumentPage })),
);
const NewOrderPage = lazy(() => import('@/pages/orders/NewOrderPage').then((m) => ({ default: m.NewOrderPage })));
const OrderDocumentPage = lazy(() =>
  import('@/pages/orders/OrderDocumentPage').then((m) => ({ default: m.OrderDocumentPage })),
);
const WorkOrderDocumentPage = lazy(() =>
  import('@/pages/orders/WorkOrderDocumentPage').then((m) => ({ default: m.WorkOrderDocumentPage })),
);
const TreasuryPage = lazy(() => import('@/pages/treasury/TreasuryPage').then((m) => ({ default: m.TreasuryPage })));
const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ProductionBoardPage = lazy(() =>
  import('@/pages/production-board/ProductionBoardPage').then((m) => ({ default: m.ProductionBoardPage })),
);
const WorkOrderTimelinePage = lazy(() =>
  import('@/pages/production-board/WorkOrderTimelinePage').then((m) => ({ default: m.WorkOrderTimelinePage })),
);
const MachinesPage = lazy(() => import('@/pages/production-board/MachinesPage').then((m) => ({ default: m.MachinesPage })));
const WorkflowTemplatesPage = lazy(() =>
  import('@/pages/workflow-templates/WorkflowTemplatesPage').then((m) => ({ default: m.WorkflowTemplatesPage })),
);
const KioskPage = lazy(() => import('@/pages/attendance/KioskPage').then((m) => ({ default: m.KioskPage })));

function RouteFallback() {
  return <div className="text-muted-foreground p-6 text-sm">جارٍ التحميل…</div>;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ConfirmProvider>
          <Suspense fallback={<RouteFallback />}>
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

              <Route element={<ProtectedRoute permission="workflow-templates.view" />}>
                <Route path="/workflow-templates" element={<WorkflowTemplatesPage />} />
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
          </Suspense>
          </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
