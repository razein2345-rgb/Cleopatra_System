import { z } from 'zod';

export const permissionSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1),
  module: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable(),
  isSystem: z.boolean(),
});

export const createPermissionSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(
      /^(\*|[a-z0-9-]+\.(\*|[a-z0-9-]+))$/,
      'Permission key must look like "module.action", "module.*", or "*"',
    ),
  module: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

export type Permission = z.infer<typeof permissionSchema>;
export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
