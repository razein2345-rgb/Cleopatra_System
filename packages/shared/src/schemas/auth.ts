import { z } from 'zod';
import { userSchema } from './user.js';

/** Response shape for POST /api/auth/login and GET /api/auth/me. */
export const authContextSchema = z.object({
  user: userSchema,
  permissions: z.array(z.string()),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export type AuthContext = z.infer<typeof authContextSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
