import { z } from 'zod';

export const readyProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
});

export const createReadyProductSchema = readyProductSchema.omit({ id: true });
export const updateReadyProductSchema = createReadyProductSchema.partial();

export type ReadyProduct = z.infer<typeof readyProductSchema>;
export type CreateReadyProductInput = z.infer<typeof createReadyProductSchema>;
export type UpdateReadyProductInput = z.infer<typeof updateReadyProductSchema>;
