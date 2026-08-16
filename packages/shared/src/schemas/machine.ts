import { z } from 'zod';

/** system_specifications_v2.md §6.5.1/§16.1 — شغالة/متوقفة/صيانة. */
export const machineStatusSchema = z.enum(['RUNNING', 'STOPPED', 'MAINTENANCE']);

export const machineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  branchId: z.string().uuid(),
  departmentId: z.string().uuid().nullable(),
  status: machineStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createMachineSchema = z.object({
  name: z.string().trim().min(1),
  branchId: z.string().uuid(),
  departmentId: z.string().uuid().nullable().optional(),
  status: machineStatusSchema.default('RUNNING'),
});

export const updateMachineSchema = z.object({
  name: z.string().trim().min(1).optional(),
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  status: machineStatusSchema.optional(),
});

export type MachineStatus = z.infer<typeof machineStatusSchema>;
export type Machine = z.infer<typeof machineSchema>;
export type CreateMachineInput = z.infer<typeof createMachineSchema>;
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;
