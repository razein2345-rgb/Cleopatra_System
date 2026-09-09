import { z } from 'zod';

/**
 * Owner (2026-09-09, "داشبورد Call Center... سجل مكالمة جديدة... العميل:
 * بحث/اختيار... النوع: وارد/صادر... الغرض: استفسار/متابعة طلب/شكوى...
 * النتيجة: تم الحل/محتاج متابعة") — Phase 4's Call Center piece: a manual
 * record of a call that already happened (no telephony integration/
 * dialer). See `CallLog`'s own schema.prisma doc comment for why the
 * caller can be an existing partner, a not-yet-converted lead, or a
 * brand-new unknown number.
 */
export const callDirectionSchema = z.enum(['INBOUND', 'OUTBOUND']);
export const callOutcomeSchema = z.enum(['RESOLVED', 'NEEDS_FOLLOWUP']);

export const callLogSchema = z.object({
  id: z.string().uuid(),
  direction: callDirectionSchema,
  purpose: z.string(),
  outcome: callOutcomeSchema,
  notes: z.string().nullable(),
  partnerId: z.string().uuid().nullable(),
  partnerName: z.string().nullable(),
  leadId: z.string().uuid().nullable(),
  leadName: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  branchId: z.string().uuid(),
  staffId: z.string().uuid(),
  staffName: z.string().nullable(),
  followUpDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Owner-confirmed shape — the caller is EXACTLY ONE of an existing
 * partner, a lead, or a free-typed brand-new contact; never more than one
 * at once (a call is about one specific person), and never none at all
 * (every call needs a name to show in the log even if there's no matching
 * record yet).
 */
export const createCallLogSchema = z
  .object({
    direction: callDirectionSchema,
    purpose: z.string().trim().min(1).max(200),
    outcome: callOutcomeSchema,
    notes: z.string().trim().max(2000).optional(),
    partnerId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    contactName: z.string().trim().min(1).max(200).optional(),
    contactPhone: z.string().trim().max(50).optional(),
    branchId: z.string().uuid(),
    followUpDate: z.string().optional(),
  })
  .refine((v) => Boolean(v.partnerId) || Boolean(v.leadId) || Boolean(v.contactName), {
    message: 'لازم تختار عميل أو Lead، أو تكتب اسم المتصل على الأقل',
    path: ['contactName'],
  })
  .refine((v) => [v.partnerId, v.leadId].filter(Boolean).length <= 1, {
    message: 'اختار عميل أو Lead، مش الاتنين مع بعض',
    path: ['partnerId'],
  });

export const updateCallLogSchema = z.object({
  direction: callDirectionSchema.optional(),
  purpose: z.string().trim().min(1).max(200).optional(),
  outcome: callOutcomeSchema.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  followUpDate: z.string().nullable().optional(),
});

export const listCallLogsQuerySchema = z.object({
  partnerId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
});

export type CallDirection = z.infer<typeof callDirectionSchema>;
export type CallOutcome = z.infer<typeof callOutcomeSchema>;
export type CallLog = z.infer<typeof callLogSchema>;
export type CreateCallLogInput = z.infer<typeof createCallLogSchema>;
export type UpdateCallLogInput = z.infer<typeof updateCallLogSchema>;
export type ListCallLogsQuery = z.infer<typeof listCallLogsQuerySchema>;
