import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

// Trim + lowercase BEFORE validating, so surrounding whitespace/case is fine.
const email = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z.object({
  email,
  password,
  firstName: z.string().min(1).max(80).trim(),
  lastName: z.string().min(1).max(80).trim(),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(10).max(200) });
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(500) });
export type RefreshDto = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).max(500),
  allDevices: z.boolean().optional().default(false),
});
export type LogoutDto = z.infer<typeof logoutSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password,
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
