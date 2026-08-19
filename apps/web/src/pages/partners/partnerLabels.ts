import type {
  AddressType,
  LeadSource,
  PartnerCommercialStatus,
  PartnerRiskLevel,
  PartnerRole,
  PartnerStatus,
  PaymentMethod,
} from '@cleopatra/shared';

export const PARTNER_ROLE_LABELS: Record<PartnerRole, string> = {
  CUSTOMER: 'عميل',
  SUPPLIER: 'مورّد',
  GOVERNMENT: 'جهة حكومية',
  SCHOOL: 'مدرسة',
  HOSPITAL: 'مستشفى',
  COMPANY: 'شركة',
  PRINTING_HOUSE: 'مطبعة',
  INTERNAL_DEPARTMENT: 'قسم داخلي',
};

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  PROSPECT: 'عميل محتمل',
  ACTIVE: 'نشط',
  INACTIVE: 'غير نشط',
  BLOCKED: 'محظور',
};

/** Tone for `StatusBadge` — the one status-color vocabulary the whole ERP uses (see StatusBadge.tsx). */
export const PARTNER_STATUS_TONES: Record<PartnerStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  PROSPECT: 'info',
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  BLOCKED: 'danger',
};

/** PRODUCT_ROADMAP.md §2 — where a lead/customer came from. */
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  REFERRAL: 'إحالة',
  SOCIAL_MEDIA: 'سوشيال ميديا',
  WALK_IN: 'زيارة مباشرة',
  PHONE_INQUIRY: 'استفسار تليفوني',
  WEBSITE: 'الموقع الإلكتروني',
  REPEAT_CUSTOMER: 'عميل متكرر',
  OTHER: 'أخرى',
};

export const LEAD_SOURCE_OPTIONS = Object.entries(LEAD_SOURCE_LABELS) as [LeadSource, string][];

export const PARTNER_ROLE_OPTIONS = Object.entries(PARTNER_ROLE_LABELS) as [PartnerRole, string][];
export const PARTNER_STATUS_OPTIONS = Object.entries(PARTNER_STATUS_LABELS) as [
  PartnerStatus,
  string,
][];

export const ADDRESS_TYPE_LABELS: Record<AddressType, string> = {
  BILLING: 'فوترة',
  SHIPPING: 'شحن',
  OFFICE: 'مكتب',
  FACTORY: 'مصنع',
  BRANCH: 'فرع',
  WAREHOUSE: 'مخزن',
  REGISTERED: 'العنوان المسجل',
  OTHER: 'أخرى',
};

export const ADDRESS_TYPE_OPTIONS = Object.entries(ADDRESS_TYPE_LABELS) as [
  AddressType,
  string,
][];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'نقدًا',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'إنستاباي',
  BANK_ACCOUNT: 'حساب بنكي',
};

export const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS) as [
  PaymentMethod,
  string,
][];

export const COMMERCIAL_STATUS_LABELS: Record<PartnerCommercialStatus, string> = {
  ACTIVE: 'نشط',
  ON_HOLD: 'موقوف مؤقتًا',
  UNDER_REVIEW: 'قيد المراجعة',
};

export const COMMERCIAL_STATUS_OPTIONS = Object.entries(COMMERCIAL_STATUS_LABELS) as [
  PartnerCommercialStatus,
  string,
][];

export const RISK_LEVEL_LABELS: Record<PartnerRiskLevel, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'مرتفعة',
};

export const RISK_LEVEL_OPTIONS = Object.entries(RISK_LEVEL_LABELS) as [
  PartnerRiskLevel,
  string,
][];
