import {
  LayoutDashboard,
  Settings as SettingsIcon,
  Building2,
  FileText,
  Factory,
  UserCog,
  ShieldCheck,
  KeyRound,
  Wallet,
  Package,
  Briefcase,
  Wrench,
  MonitorSmartphone,
  Laptop,
  History,
  GitBranch,
  UserPlus,
  Truck,
  FileBarChart,
  MessageCircle,
  Phone,
  Repeat,
  CalendarDays,
  Megaphone,
  Sparkles,
  ShoppingCart,
  Receipt,
  Landmark,
  Target,
  ShoppingBag,
  Warehouse,
  ClipboardCheck,
  FilePlus,
  HandCoins,
} from 'lucide-react';
import type { NavEntry } from '@/components/cleopatra';

/**
 * ERP-navigation research (2026-08-16, owner-requested department-structure
 * research): grouping nav links under clear section headers — instead of
 * one flat list — is the recurring pattern for small teams where one
 * employee holds several roles at once, so "مين بيمسك إيه" reads at a
 * glance. Reuses `NavTree`'s existing `kind: 'group'` support — no new
 * permission logic; a group simply hides itself if none of its items are
 * visible to the current user's permissions.
 *
 * Re-organized (owner, 2026-09-25) from 4 broad groups ("الإنتاج", "الإدارة
 * والتجارة", "المالية", "النظام") into 7 by function. Pure regrouping: every
 * pre-existing link keeps its path and permission; the only additions are the
 * three links marked NEW below. Groups start collapsed except the one holding
 * the current page (`NavTree`).
 *
 * Extracted from `AppShell.tsx` so the structure can be unit-tested
 * (`navItems.test.ts`).
 */
export const NAV_ITEMS: NavEntry[] = [
  { kind: 'link', to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, end: true },
  // Owner (2026-09-09, "AI... متدرب كويس جداً على النظام" → Phase 1
  // approval, "usable by كل الموظفين المسجلين دخول") — open to everyone,
  // no `permission`, same open-nav pattern as `/communication-hub`.
  { kind: 'link', to: '/ai-assistant', label: 'مساعد Cleopatra الذكي', icon: Sparkles },
  // POS / Cashier (2026-09-11) — same `orders.create` gate as `/orders/new`.
  // Deliberately top-level, outside any group (owner, 2026-09-25): a cashier
  // needs to reach it in the fewest clicks — CLAUDE.md §6's "أقل عدد
  // ضغطات ممكن للوصول لأي Job" applies just as much to a sale.
  { kind: 'link', to: '/pos', label: 'الكاشير', icon: ShoppingCart, permission: 'orders.create' },
  {
    kind: 'group',
    label: 'الحسابات',
    icon: Landmark,
    items: [
      {
        kind: 'link',
        to: '/treasury',
        label: 'الخزينة والنقدية',
        icon: Wallet,
        // FEATURE-007 M3 — reception (treasury.create only) sees a scoped
        // view of this same page; treasury.view sees the full ledger/balance.
        permission: ['treasury.view', 'treasury.create'],
      },
      // Accounting audit fix (2026-09-17, Decision 6 / Phase I) — a
      // dedicated business expense with a DUE -> PAID lifecycle, distinct
      // from "المصاريف الشهرية الثابتة" (embedded inside the Treasury
      // page itself, Super-Admin-only — see `FixedMonthlyExpensesEditor.tsx`).
      { kind: 'link', to: '/expenses', label: 'المصروفات', icon: Receipt, permission: 'expenses.view' },
      // `inactiveWhenSearch`: the "مطابقة المخزون" tab has its own link under المخازن.
      { kind: 'link', to: '/reports', label: 'التقارير', icon: FileBarChart, permission: 'reports.view', inactiveWhenSearch: 'tab=reconciliation' },
      // Opening State / Cutover (Phase 3C.2) — gated on the existing
      // treasury.view permission as the closest available proxy for
      // "financially sensitive area," since no dedicated permission was
      // added this phase. The server independently re-checks every actual
      // action (create/approve/activate/reopen/supersede) regardless of
      // what this nav gate shows.
      { kind: 'link', to: '/cutover', label: 'الرصيد الافتتاحي (Cutover)', icon: Wallet, permission: 'treasury.view' },
      // Cutover-revision-round decision (post-3D) — CustomerOpening's own
      // minimal screen (company-wide, not a branch-scoped Cutover child).
      // Kept under الحسابات (owner, 2026-09-25): a financial figure with the
      // same `treasury.view` gate, not a customer-management screen.
      { kind: 'link', to: '/customer-opening', label: 'الرصيد الافتتاحي للعملاء', icon: Wallet, permission: 'treasury.view' },
    ],
  },
  {
    kind: 'group',
    label: 'التسويق',
    icon: Target,
    items: [
      { kind: 'link', to: '/leads', label: 'العملاء المحتملون', icon: UserPlus, permission: 'leads.view' },
      { kind: 'link', to: '/campaigns', label: 'الحملات التسويقية', icon: Megaphone, permission: 'campaigns.view' },
      // Owner (2026-09-09, "المرحلة الرابعة... أبدأ بداشبورد Call Center
      // الأول") — the call log ("سجل المكالمات").
      { kind: 'link', to: '/call-center', label: 'مركز الاتصال', icon: Phone, permission: 'call-logs.view' },
      // Owner (2026-09-09, "المرحلة الخامسة" → "تقويم المحتوى").
      { kind: 'link', to: '/content-calendar', label: 'تقويم المحتوى', icon: CalendarDays, permission: 'content-calendar.view' },
    ],
  },
  {
    kind: 'group',
    label: 'المبيعات',
    icon: ShoppingBag,
    items: [
      // NEW (owner, 2026-09-25) — a direct link to the new-invoice screen (it
      // used to be reachable only from inside المستندات); same gate as the route.
      { kind: 'link', to: '/orders/new', label: 'فاتورة جديدة', icon: FilePlus, permission: 'orders.create' },
      // `alsoMatches`: an open invoice (`/orders/:id`) belongs to this link's group.
      { kind: 'link', to: '/quotations', label: 'المستندات', icon: FileText, permission: 'quotations.view', alsoMatches: ['/orders/'] },
      { kind: 'link', to: '/partners', label: 'العملاء', icon: Building2, permission: 'partners.view' },
      // Owner (2026-09-09, "استكمال إعادة الطلب التلقائي") — the full
      // cross-customer re-order list; follow-up of existing customers.
      { kind: 'link', to: '/reorder-due', label: 'متابعة إعادة الطلب', icon: Repeat, permission: 'orders.view' },
      // Owner (2026-09-08, "افتح كل وسائل التواصل بتاعتي من السيستم...
      // عايز الموظف بتاع الإستقبال يتابع كل حاجه") — open to everyone
      // (no `permission`): the reception/sales staff replying to customers
      // need this daily, not just roles holding a specific module grant.
      { kind: 'link', to: '/communication-hub', label: 'مركز التواصل', icon: MessageCircle },
    ],
  },
  {
    kind: 'group',
    label: 'الإدارة',
    icon: Briefcase,
    items: [
      { kind: 'link', to: '/users', label: 'الموظفين', icon: UserCog, permission: 'employees.view', inactiveOnPaths: ['/users/advances-report'] },
      // NEW (owner, 2026-09-25) — the advances & salaries report, which used to
      // be reachable only from a button inside the employees screen; same gate
      // as its route (`employees.view`).
      { kind: 'link', to: '/users/advances-report', label: 'تقرير السلف والمرتبات', icon: HandCoins, permission: 'employees.view' },
      // Owner (2026-08-17): a nav entry point for the attendance Kiosk
      // (previously URL-only). Gated by the existing `attendance.kiosk`
      // permission — NOT restricted to Super Admin (a different, unrelated
      // precedent: the attendance *admin* screen, which stays Super-Admin-only).
      { kind: 'link', to: '/attendance/kiosk', label: 'كشك الحضور', icon: MonitorSmartphone, permission: 'attendance.kiosk' },
      { kind: 'link', to: '/roles', label: 'الأدوار', icon: ShieldCheck, permission: 'roles.view' },
      { kind: 'link', to: '/permissions', label: 'الصلاحيات', icon: KeyRound, permission: 'permissions.view' },
    ],
  },
  {
    kind: 'group',
    label: 'المخازن',
    icon: Warehouse,
    items: [
      { kind: 'link', to: '/inventory', label: 'المخزن', icon: Package, permission: 'inventory.view' },
      { kind: 'link', to: '/suppliers', label: 'الموردين', icon: Truck, permission: 'suppliers.view' },
      // NEW (owner, 2026-09-25) — opens the reports screen straight on its
      // "مطابقة المخزون" tab; same gate as the reports route (`reports.view`).
      { kind: 'link', to: '/reports?tab=reconciliation', label: 'مطابقة المخزون', icon: ClipboardCheck, permission: 'reports.view' },
    ],
  },
  {
    kind: 'group',
    label: 'الإنتاج',
    icon: Factory,
    items: [
      // `alsoMatches`: an open work order belongs to the production group.
      { kind: 'link', to: '/production-board', label: 'لوحة الإنتاج', icon: Factory, permission: 'work-orders.view', alsoMatches: ['/work-orders/'] },
      { kind: 'link', to: '/machines', label: 'الماكينات', icon: Wrench, permission: 'machines.view' },
      { kind: 'link', to: '/workflow-templates', label: 'قوالب سير العمل', icon: GitBranch, permission: 'workflow-templates.view' },
    ],
  },
  {
    kind: 'group',
    label: 'النظام',
    icon: SettingsIcon,
    items: [
      { kind: 'link', to: '/settings', label: 'الإعدادات', icon: SettingsIcon, permission: 'settings.view' },
      // Owner ("مفيش شاشة لعرض الـAudit Log نفسه") — same sensitivity class
      // as the attendance admin screen: reveals every sensitive change
      // across every module, not gated by the regular permission catalog.
      { kind: 'link', to: '/audit-log', label: 'سجل التدقيق', icon: History, superAdminOnly: true },
      // Owner (2026-08-24, "عايز اقدر احدد الأجهزة المسموح لها بفتح
      // النظام") — same sensitivity class as the audit log/attendance admin
      // screens, not gated by the regular permission catalog.
      { kind: 'link', to: '/devices', label: 'الأجهزة', icon: Laptop, superAdminOnly: true },
    ],
  },
];
