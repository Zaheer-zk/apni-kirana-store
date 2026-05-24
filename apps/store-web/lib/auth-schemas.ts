import { z } from 'zod';

/**
 * Form schemas for store-web auth screens. Mirrors
 * `apps/customer-web/lib/auth-schemas.ts` (intentionally) — we only diverge
 * on the multi-step store registration, which extends `registerSchema` with
 * the store-detail step (`storeRegisterSchema`).
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
 * email and password are OPTIONAL — a store owner who skips them can still
 * sign in with phone+OTP. If they DO fill in username OR email they must
 * also set a password (otherwise the password-login mode would be useless).
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

/**
 * Step 3 of store-owner registration — collects the store details after the
 * OTP is verified and the owner is authenticated. lat/lng come from the map
 * picker so we accept them as numbers (the form converts before submit).
 */
export const storeRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Store name is required'),
  description: z.string().trim().max(500).optional(),
  category: z.enum(['GROCERY', 'PHARMACY', 'GENERAL', 'RESTAURANT'], {
    errorMap: () => ({ message: 'Pick a category' }),
  }),
  lat: z.number().refine((v) => v >= 6 && v <= 38, 'Map pin must be inside India'),
  lng: z.number().refine((v) => v >= 68 && v <= 98, 'Map pin must be inside India'),
  street: z.string().trim().min(2, 'Street address is required'),
  city: z.string().trim().min(2, 'City is required'),
  state: z.string().trim().min(2, 'State is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, 'Opening time must be in HH:MM format'),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, 'Closing time must be in HH:MM format'),
});
export type StoreRegisterInput = z.infer<typeof storeRegisterSchema>;

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
