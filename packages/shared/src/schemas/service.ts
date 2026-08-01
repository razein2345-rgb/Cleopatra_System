import { z } from 'zod';

export const serviceCategorySchema = z.enum(['DESIGN', 'MONTAGE']);

export const serviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  category: serviceCategorySchema,
});

export const createServiceSchema = serviceSchema.omit({ id: true });
export const updateServiceSchema = createServiceSchema.partial();

export type ServiceCategory = z.infer<typeof serviceCategorySchema>;
export type Service = z.infer<typeof serviceSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
