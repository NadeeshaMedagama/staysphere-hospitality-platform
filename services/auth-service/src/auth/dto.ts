import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('A valid email address is required');

export const registerSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(256),
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'Phone must be a valid international number')
    .optional(),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(256),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(256),
});
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const requestPasswordResetSchema = z.object({ email });
export const completePasswordResetSchema = z.object({
  token: z.string().min(32).max(512),
  newPassword: z.string().min(1).max(256),
});
