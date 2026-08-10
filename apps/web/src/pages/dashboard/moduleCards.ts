import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Factory,
  FileText,
  KeyRound,
  Package,
  ReceiptText,
  Settings as SettingsIcon,
  ShieldCheck,
  UserCog,
  Wallet,
} from 'lucide-react';

export type ModuleCardTone = 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'danger';

export interface DashboardModuleCard {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  tone: ModuleCardTone;
  permission?: string | string[];
}

/**
 * FEATURE-007 — the video-reference-style home screen grid (Section E of
 * VIDEO_VS_CLEOPATRA_REVIEW.md: a wall of big navigation cards). Kept
 * separate from `AppShell.tsx`'s `NAV_ITEMS` (the sidebar) rather than
 * shared, because this list intentionally differs — it includes
 * `/orders/new` (no sidebar entry exists for it yet, matching the video's
 * own "أوامر الشغل والفواتير" card) and is ordered for how often reception
 * staff act on it, not how the sidebar groups modules.
 */
export const DASHBOARD_MODULE_CARDS: DashboardModuleCard[] = [
  { id: 'new-order', to: '/orders/new', label: 'الطلبات والمستندات', icon: ReceiptText, tone: 'success', permission: ['orders.create', 'quotations.create'] },
  { id: 'partners', to: '/partners', label: 'العملاء', icon: Building2, tone: 'primary', permission: 'partners.view' },
  { id: 'quotations', to: '/quotations', label: 'المستندات', icon: FileText, tone: 'secondary', permission: 'quotations.view' },
  { id: 'treasury', to: '/treasury', label: 'الخزينة والنقدية', icon: Wallet, tone: 'warning', permission: ['treasury.view', 'treasury.create'] },
  { id: 'inventory', to: '/inventory', label: 'المخزن', icon: Package, tone: 'info', permission: 'inventory.view' },
  { id: 'production-board', to: '/production-board', label: 'لوحة الإنتاج', icon: Factory, tone: 'primary', permission: 'work-orders.view' },
  { id: 'users', to: '/users', label: 'المستخدمون', icon: UserCog, tone: 'secondary', permission: 'employees.view' },
  { id: 'roles', to: '/roles', label: 'الأدوار', icon: ShieldCheck, tone: 'info', permission: 'roles.view' },
  { id: 'permissions', to: '/permissions', label: 'الصلاحيات', icon: KeyRound, tone: 'danger', permission: 'permissions.view' },
  { id: 'settings', to: '/settings', label: 'الإعدادات', icon: SettingsIcon, tone: 'warning', permission: 'settings.view' },
];
