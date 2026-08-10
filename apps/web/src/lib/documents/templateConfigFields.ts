import type { DocumentTemplateConfig } from '@cleopatra/shared';

/**
 * The concrete field set behind `DocumentTemplate.config` /
 * `documentOverrides` (both are `Json` at the schema layer — see
 * `documentTemplateConfigSchema`'s own comment: the exact key set is a
 * frontend concern). Defined once here so the M6 template editor and the
 * future M8 override editor render the *same* field list, per
 * 02_PLAN.md's Milestone 8 note ("mirroring config's field set so the
 * override editor and the template editor share the same field list, not
 * two different ones").
 */
export type TemplateConfigFieldDef =
  | { key: string; label: string; type: 'boolean' }
  | { key: string; label: string; type: 'text' }
  | { key: string; label: string; type: 'textarea' };

export const TEMPLATE_CONFIG_FIELDS: TemplateConfigFieldDef[] = [
  { key: 'showLogo', label: 'إظهار الشعار', type: 'boolean' },
  { key: 'showBusinessAddress', label: 'إظهار العنوان', type: 'boolean' },
  { key: 'showBusinessPhone', label: 'إظهار الهاتف', type: 'boolean' },
  { key: 'showBusinessEmail', label: 'إظهار البريد الإلكتروني', type: 'boolean' },
  { key: 'showTaxNumber', label: 'إظهار الرقم الضريبي', type: 'boolean' },
  { key: 'showCommercialRegisterNumber', label: 'إظهار رقم السجل التجاري', type: 'boolean' },
  { key: 'headerNote', label: 'ملاحظة أعلى المستند', type: 'text' },
  { key: 'termsText', label: 'الشروط والأحكام الافتراضية', type: 'textarea' },
  { key: 'footerText', label: 'نص أسفل المستند', type: 'textarea' },
  { key: 'showSignatureArea', label: 'إظهار مكان التوقيع', type: 'boolean' },
];

export const DEFAULT_TEMPLATE_CONFIG: DocumentTemplateConfig = {
  showLogo: true,
  showBusinessAddress: true,
  showBusinessPhone: true,
  showBusinessEmail: true,
  showTaxNumber: false,
  showCommercialRegisterNumber: false,
  headerNote: '',
  termsText: '',
  footerText: '',
  showSignatureArea: true,
};
