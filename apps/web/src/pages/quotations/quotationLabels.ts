import type { OrderStatus, QuotationApprovalState, QuotationStatus } from '@cleopatra/shared';
import { KNOWN_QUOTATION_ITEM_TYPES } from '@cleopatra/shared';

/** Owner's exact wording (2026-08-10): تحت الإنشاء / بإنتظار موافقة العميل / تمت الموافقة / رفض — EXPIRED/CONVERTED are additional states the workflow can still reach, not part of that list, so they keep their own descriptive labels. */
export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'تحت الإنشاء',
  SENT: 'بإنتظار موافقة العميل',
  ACCEPTED: 'تمت الموافقة',
  REJECTED: 'مرفوض',
  EXPIRED: 'منتهي الصلاحية',
  CONVERTED: 'تم التحويل لأمر تشغيل',
};

export const QUOTATION_APPROVAL_LABELS: Record<QuotationApprovalState, string> = {
  PENDING: 'قيد الاعتماد',
  APPROVED: 'معتمد',
  NEEDS_REVISION: 'يحتاج تعديل',
};

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Tone for `StatusBadge` — the one status-color vocabulary the whole ERP uses (see StatusBadge.tsx). */
export const QUOTATION_STATUS_TONES: Record<QuotationStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
  CONVERTED: 'success',
};

export const QUOTATION_APPROVAL_TONES: Record<QuotationApprovalState, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  NEEDS_REVISION: 'danger',
};

export const ORDER_STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  DRAFT: 'neutral',
  QUOTATION: 'info',
  CONFIRMED: 'info',
  IN_PRODUCTION: 'warning',
  READY: 'success',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};

/** FEATURE-003 M2 — labels for the Order created by Quotation conversion. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'مسودة',
  QUOTATION: 'عرض سعر',
  CONFIRMED: 'مؤكد',
  IN_PRODUCTION: 'قيد التنفيذ',
  READY: 'جاهز',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغي',
};

/** Presets only — itemType is a free string, not an enforced enum (see quotationItem.ts). */
export const ITEM_TYPE_LABELS: Record<(typeof KNOWN_QUOTATION_ITEM_TYPES)[number], string> = {
  READY_PRODUCT: 'منتج جاهز',
  SERVICE: 'خدمة',
  PRINTING_PRODUCT: 'منتج طباعة',
  MARKETING_SERVICE: 'خدمة تسويقية',
  GRAPHIC_DESIGN: 'تصميم جرافيك',
  PHOTOGRAPHY: 'تصوير',
  VIDEO_EDITING: 'مونتاج فيديو',
  BRANDING: 'هوية بصرية',
  CUSTOM: 'مخصص',
};

export const ITEM_TYPE_OPTIONS = KNOWN_QUOTATION_ITEM_TYPES.map(
  (value) => [value, ITEM_TYPE_LABELS[value]] as const,
);
