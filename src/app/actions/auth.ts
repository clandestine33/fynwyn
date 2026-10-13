'use server';
import { redirect } from 'next/navigation';
import { fail, safe, UserError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp, createCustomerSession, destroyCustomerSession, requireCustomer } from '@/lib/session';
import { changePassword, login, register, requestReset, resetPassword, sendVerification, verifyEmail } from '@/server/auth';
import { email } from '@/lib/validators';
import { audit } from '@/server/audit';

const str = (f: FormData, k: string) => String(f.get(k) ?? '');
const safeNext = (n: string) => (n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard');
function limit(key: string, max: number, windowMs: number) {
  const r = rateLimit(`${key}:${clientIp() ?? 'unknown'}`, max, windowMs);
  if (!r.ok) throw new UserError(`Too many attempts. Please wait ${Math.ceil(r.retryAfterSec / 60)} minute(s) and try again.`);
}

export async function registerAction(_: unknown, f: FormData) {
  return safe(async () => {
    limit('register', 8, 3_600_000);
    const c = await register({ name: str(f, 'name'), email: str(f, 'email'), phone: str(f, 'phone'), password: str(f, 'password'), preferredPackageId: str(f, 'preferredPackageId'), acceptTerms: f.get('acceptTerms') === 'on' });
    await createCustomerSession(c.id);
    await audit(null, 'customer.register', 'Customer', c.id, { email: c.email });
    const n = str(f, 'next');
    redirect(n ? safeNext(n) : `/goals/new?welcome=1${c.preferredPackageId ? `&package=${encodeURIComponent(c.preferredPackageId)}` : ''}`);
  });
}

export async function loginAction(_: unknown, f: FormData) {
  return safe(async () => {
    limit('login', 20, 15 * 60_000);
    const c = await login({ email: str(f, 'email'), password: str(f, 'password') });
    await createCustomerSession(c.id);
    redirect(safeNext(str(f, 'next')));
  });
}

export async function logoutAction() {
  destroyCustomerSession();
  redirect('/');
}

export async function forgotAction(_: unknown, f: FormData) {
  return safe(async () => {
    limit('forgot', 5, 3_600_000);
    const parsed = email.safeParse(str(f, 'email'));
    if (!parsed.success) return fail('Enter a valid email address');
    await requestReset(parsed.data);
    return { ok: true as const, message: 'If that email is registered, a reset link is on its way.' };
  });
}

export async function resetAction(_: unknown, f: FormData) {
  return safe(async () => {
    if (str(f, 'password') !== str(f, 'confirm')) return fail('Passwords do not match');
    await resetPassword({ token: str(f, 'token'), password: str(f, 'password') });
    redirect('/login?reset=1');
  });
}

export async function verifyEmailAction(_: unknown, f: FormData) {
  return safe(async () => {
    await verifyEmail(str(f, 'token'));
    redirect('/dashboard?verified=1');
  });
}

export async function resendVerificationAction() {
  return safe(async () => {
    limit('resend', 3, 3_600_000);
    const c = await requireCustomer();
    if (c.emailVerifiedAt) return { ok: true as const, message: 'Your email is already verified.' };
    await sendVerification(c);
    return { ok: true as const, message: 'Verification email sent. Check your inbox.' };
  });
}

export async function changePasswordAction(_: unknown, f: FormData) {
  return safe(async () => {
    const c = await requireCustomer();
    if (str(f, 'password') !== str(f, 'confirm')) return fail('Passwords do not match');
    await changePassword(c.id, str(f, 'current'), str(f, 'password'));
    return { ok: true as const, message: 'Password updated.' };
  });
}
