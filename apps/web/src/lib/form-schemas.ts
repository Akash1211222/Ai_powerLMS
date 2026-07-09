import { z } from 'zod';

// Client-side form validation. The API re-validates server-side (source of
// truth); these mirror the password policy for fast feedback.
const password = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[0-9]/, 'Add a number');

export const loginForm = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginForm = z.infer<typeof loginForm>;

export const registerForm = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Enter a valid email'),
  password,
});
export type RegisterForm = z.infer<typeof registerForm>;

export const forgotForm = z.object({
  email: z.string().email('Enter a valid email'),
});
export type ForgotForm = z.infer<typeof forgotForm>;

export const resetForm = z
  .object({
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
export type ResetForm = z.infer<typeof resetForm>;
