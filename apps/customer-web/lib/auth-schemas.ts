import { z } from 'zod';

/**
 * Form schemas for the customer auth screens. Kept here (not next to the
 * components) so they can be re-used by both client components and any
 * future server action.
 */

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Enter a valid 10-digit mobile number');

export const passwordLoginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, 'Enter your username or 10-digit mobile number'),
  password: z.string().min(1, 'Enter your password'),
});
export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;

export const phoneOnlySchema = z.object({
  phone: phoneSchema,
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name'),
  phone: phoneSchema,
  email: z.string().trim().email('Enter a valid email address'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .regex(/^[a-z0-9_.-]+$/i, 'Letters, numbers, dots, dashes and underscores only'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter the email on your account'),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'The two passwords do not match',
    path: ['confirm'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((data) => data.newPassword === data.confirm, {
    message: 'The two passwords do not match',
    path: ['confirm'],
  });
