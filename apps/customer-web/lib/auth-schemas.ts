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

/**
 * Registration form: phone + name are required for OTP delivery. Username,
 * email and password are OPTIONAL — a user who skips them can still log in
 * with phone+OTP. If they DO fill in username OR email they must also set a
 * password (otherwise there'd be no way to use the password login mode).
 *
 * Empty strings from the form are normalised to `undefined` so the backend
 * register schema's `.optional()` rules fire instead of complaining about
 * an empty-string email being invalid.
 */
const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .refine(
    (v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    'Enter a valid email address',
  );

const optionalUsername = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .refine(
    (v) => v === undefined || (v.length >= 3 && v.length <= 30),
    'Username must be 3-30 characters',
  )
  .refine(
    (v) => v === undefined || /^[a-zA-Z0-9_-]+$/.test(v),
    'Letters, numbers, dashes and underscores only',
  );

const optionalPassword = z
  .string()
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .refine(
    (v) => v === undefined || v.length >= 8,
    'Password must be at least 8 characters',
  );

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name'),
    phone: phoneSchema,
    email: optionalEmail,
    username: optionalUsername,
    password: optionalPassword,
  })
  .refine(
    (data) => {
      const hasIdentifier = !!data.email || !!data.username;
      return !hasIdentifier || !!data.password;
    },
    {
      message: 'Required if you set a username or email',
      path: ['password'],
    },
  );
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
