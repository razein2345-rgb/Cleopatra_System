import { z } from 'zod';

/** Mirrors Prisma's `AuditAction` enum exactly — see `apps/api/prisma/schema.prisma`. */
export const auditActionSchema = z.enum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'STATUS_CHANGE',
  'LOGIN',
  'LOGOUT',
  'PASSWORD_RESET',
  'PRIMARY_CHANGED',
  'DEFAULT_CHANGED',
  'CREATE_CATEGORY',
  'UPDATE_CATEGORY',
  'DELETE_CATEGORY',
  'CREATE_TAG',
  'UPDATE_TAG',
  'DELETE_TAG',
  'CATEGORY_CHANGED',
  'TAGS_CHANGED',
  'PIN',
  'UNPIN',
  'APPROVAL_CHANGED',
  'SECURITY_REJECTION',
]);

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  action: auditActionSchema,
  performedById: z.string().uuid().nullable(),
  performedByName: z.string().nullable(),
  branchId: z.string().uuid().nullable(),
  partnerId: z.string().uuid().nullable(),
  previousValue: z.unknown().nullable(),
  newValue: z.unknown().nullable(),
  createdAt: z.string(),
});

export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
