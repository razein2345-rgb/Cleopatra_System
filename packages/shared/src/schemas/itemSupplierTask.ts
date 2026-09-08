import { z } from 'zod';

/**
 * Owner (2026-09-08, "احياناً هحتاج اكستم انا وورك فلو عن طريق بند يدوي...
 * عميل جايلي عايز يعمل ختم مقاس 4*4... هحتاج اختار إنه الطلب ده ليه عدد 2
 * مورد الاول بتاع السيرل والتاني اللي هشتري منه الختم بالمقاس ده") — an
 * ad-hoc, per-item, open-ended list of extra supplier legs a rare/custom
 * item needs. See `ItemSupplierTask`'s own schema.prisma doc comment for
 * the full rationale (why this is its own lightweight model, not real
 * WorkflowStage/StageInstance rows).
 */
export const itemSupplierTaskStatusSchema = z.enum(['WAITING', 'SENT', 'RECEIVED']);

export const itemSupplierTaskSchema = z.object({
  id: z.string().uuid(),
  orderItemId: z.string().uuid(),
  label: z.string(),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  status: itemSupplierTaskStatusSchema,
  sentDate: z.string().nullable(),
  expectedReturnDate: z.string().nullable(),
  actualReturnDate: z.string().nullable(),
  sortOrder: z.number().int(),
  // Denormalized context for the Production Board's cross-order list —
  // owner confirmed explicitly: "يكون واضح إسم المورد وايه اللي هيتجاب من
  // عنده بالظبط بخصوص إنهو طلب وتبع عميل مين".
  itemName: z.string().nullable(),
  workOrderNumber: z.string().nullable(),
  customerName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Composed inline with a `CreateOrderItemInput` — created in the same transaction as the OrderItem, no `orderItemId` yet at this point (server resolves it). */
export const orderItemSupplierTaskInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  supplierId: z.string().uuid().nullable().optional(),
});

export const updateItemSupplierTaskSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  supplierId: z.string().uuid().nullable().optional(),
  status: itemSupplierTaskStatusSchema.optional(),
  sentDate: z.string().nullable().optional(),
  expectedReturnDate: z.string().nullable().optional(),
  actualReturnDate: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type ItemSupplierTaskStatus = z.infer<typeof itemSupplierTaskStatusSchema>;
export type ItemSupplierTask = z.infer<typeof itemSupplierTaskSchema>;
export type OrderItemSupplierTaskInput = z.infer<typeof orderItemSupplierTaskInputSchema>;
export type UpdateItemSupplierTaskInput = z.infer<typeof updateItemSupplierTaskSchema>;
