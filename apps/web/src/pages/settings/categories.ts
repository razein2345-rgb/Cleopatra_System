import type { ComponentType } from 'react';
import { Printer, Coins, Package, Wrench, Building2, FileText } from 'lucide-react';
import { PrintingSettings } from './PrintingSettings';
import { PricingSettings } from './PricingSettings';
import { ProductsSettings } from './ProductsSettings';
import { ServicesSettings } from './ServicesSettings';
import { CompanySettings } from './CompanySettings';
import { DocumentsSettings } from './DocumentsSettings';

export interface SettingsCategory {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}

/**
 * Every category renders under `/settings/:categoryId`. Add a new one by
 * building its screen component and listing it here — `SettingsPage.tsx`/
 * `SettingsHome.tsx` never change. Everyone who reaches `/settings` at all
 * already has `settings.view` (the route itself is gated in `App.tsx`),
 * so no per-category permission exists here — edit-vs-view within a
 * category is each screen's own `settings.edit` check, unchanged from
 * before this refinement.
 *
 * Not listed yet, per REFINEMENTS.md §3: Library, Workflow, AI & Advisor
 * (no real screen exists), and Users & Permissions (already top-level
 * Sidebar destinations, not moved here — flagged as an open IA question,
 * not decided unilaterally).
 */
export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'printing',
    label: 'الطباعة',
    description: 'أنواع الورق ودليل المقاسات',
    icon: Printer,
    Component: PrintingSettings,
  },
  {
    id: 'pricing',
    label: 'التسعير',
    description: 'الأسعار الثابتة وهامش الربح الافتراضي',
    icon: Coins,
    Component: PricingSettings,
  },
  {
    id: 'products',
    label: 'المنتجات',
    description: 'المنتجات الجاهزة',
    icon: Package,
    Component: ProductsSettings,
  },
  {
    id: 'services',
    label: 'الخدمات',
    description: 'خدمات التصميم والمونتاج',
    icon: Wrench,
    Component: ServicesSettings,
  },
  {
    id: 'company',
    label: 'الشركة',
    description: 'تصنيفات ووسوم العملاء',
    icon: Building2,
    Component: CompanySettings,
  },
  {
    id: 'documents',
    label: 'إعدادات المستندات',
    description: 'الهوية التجارية وقوالب عروض الأسعار والفواتير وأوامر الشغل',
    icon: FileText,
    Component: DocumentsSettings,
  },
];
