import { z } from 'zod';
import { MAX_PAYMENT_NAIRA, MIN_PAYMENT_NAIRA } from './money';

export const password = z.string().min(10, 'Password must be at least 10 characters').max(128)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), 'Password must include letters and numbers');
export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(160);
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(100),
  email,
  phone: phone.optional().or(z.literal('').transform(() => undefined)),
  password,
  preferredPackageId: z.string().trim().max(40).optional().or(z.literal('').transform(() => undefined)),
  acceptTerms: z.literal(true, { message: 'You must accept the terms to join' }),
});
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const resetSchema = z.object({ token: z.string().min(20).max(200), password });

export const OCCASIONS = ['WEDDING', 'BIRTHDAY', 'ANNIVERSARY', 'BURIAL', 'NAMING', 'GRADUATION', 'CORPORATE', 'HOLIDAY', 'OTHER'] as const;
export const OCCASION_LABEL: Record<(typeof OCCASIONS)[number], string> = {
  WEDDING: 'Wedding', BIRTHDAY: 'Birthday', ANNIVERSARY: 'Anniversary', BURIAL: 'Funeral / Burial', NAMING: 'Naming ceremony',
  GRADUATION: 'Graduation', CORPORATE: 'Corporate event', HOLIDAY: 'Holiday / Festive', OTHER: 'Other celebration',
};

export const goalSchema = z.object({
  title: z.string().trim().min(2, 'Give your celebration a name').max(80),
  occasion: z.enum(OCCASIONS),
  eventDate: z.coerce.date().refine((d) => d.getTime() > Date.now() + 86_400_000, 'Event date must be in the future'),
  guestCount: z.coerce.number().int().min(1).max(100000).optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().trim().max(500).optional(),
  packageId: z.string().min(1, 'Choose a package'),
});

const amount = z.coerce.number({ message: 'Enter an amount' }).int('Amount must be a whole number of naira')
  .min(MIN_PAYMENT_NAIRA, `Minimum is ₦${MIN_PAYMENT_NAIRA}`).max(MAX_PAYMENT_NAIRA, 'Amount is too large');
export const paystackSchema = z.object({ goalId: z.string().min(1), amount });
export const transferSchema = z.object({
  goalId: z.string().min(1),
  amount,
  reference: z.string().trim().min(4, 'Enter the transfer reference').max(80),
  proofUrl: z.string().trim().url('Proof must be a valid link').max(500).optional().or(z.literal('').transform(() => undefined)),
});

export const orderSchema = z.object({
  goalId: z.string().min(1),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(999) })).min(1, 'Add at least one drink'),
  deliveryDate: z.coerce.date().optional().or(z.literal('').transform(() => undefined)),
  deliveryAddress: z.string().trim().min(8, 'Enter a full delivery address').max(300),
  deliveryPhone: phone,
  deliveryNote: z.string().trim().max(300).optional(),
});
