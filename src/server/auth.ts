import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { UserError } from '@/lib/errors';
import { newToken, sha256 } from '@/lib/crypto';
import { link, sendMail } from '@/lib/email';
import { loginSchema, registerSchema, resetSchema } from '@/lib/validators';
import type { TokenType } from '@prisma/client';

const COST = 12;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
// Compared against when the account doesn't exist so response time doesn't reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

export const hashPassword = (p: string) => bcrypt.hash(p, COST);

async function issueToken(customerId: string, type: TokenType, ttlMs: number) {
  const raw = newToken();
  await db.authToken.updateMany({ where: { customerId, type, usedAt: null }, data: { usedAt: new Date() } }); // invalidate older links
  await db.authToken.create({ data: { customerId, type, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) } });
  return raw;
}

async function consumeToken(raw: string, type: TokenType) {
  const t = await db.authToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!t || t.type !== type || t.usedAt || t.expiresAt < new Date()) throw new UserError('This link is invalid or has expired. Please request a new one.');
  const claimed = await db.authToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) throw new UserError('This link has already been used.');
  return t;
}

export async function sendVerification(customer: { id: string; email: string; name: string }) {
  const raw = await issueToken(customer.id, 'EMAIL_VERIFY', 48 * 3_600_000);
  const url = link(`/verify-email?token=${raw}`);
  await sendMail(customer.email, 'Verify your FYNWYN Drink Bank email', `Hi ${customer.name.split(' ')[0]},\n\nConfirm your email to start saving: ${url}\n\nThis link expires in 48 hours. If you didn't sign up, ignore this email.`);
}

export async function register(input: unknown) {
  const d = registerSchema.parse(input);
  const settings = await db.setting.findUnique({ where: { id: 1 } });
  if (settings && !settings.registrationOpen) throw new UserError('Registration is currently closed.');
  const existing = await db.customer.findUnique({ where: { email: d.email } });
  if (existing) throw new UserError('An account with this email already exists. Try signing in.');
  // Only keep a preferred package that actually exists and is active.
  const pref = d.preferredPackageId ? await db.package.findFirst({ where: { id: d.preferredPackageId, active: true }, select: { id: true } }) : null;
  const customer = await db.customer.create({
    data: { email: d.email, name: d.name, phone: d.phone, preferredPackageId: pref?.id, passwordHash: await hashPassword(d.password), termsVersion: settings?.termsVersion ?? '1.0', termsAcceptedAt: new Date() },
  });
  await sendVerification(customer);
  return customer;
}

export async function verifyEmail(raw: string) {
  const t = await consumeToken(raw, 'EMAIL_VERIFY');
  await db.customer.update({ where: { id: t.customerId }, data: { emailVerifiedAt: new Date() } });
}

export async function login(input: unknown) {
  const d = loginSchema.parse(input);
  const c = await db.customer.findUnique({ where: { email: d.email } });
  const hash = c?.passwordHash ?? DUMMY_HASH;
  if (c?.lockedUntil && c.lockedUntil > new Date()) throw new UserError('Too many failed attempts. Try again in a few minutes or reset your password.');
  const good = await bcrypt.compare(d.password, hash);
  if (!c || !good) {
    if (c) {
      const fails = c.failedLogins + 1;
      await db.customer.update({ where: { id: c.id }, data: fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: fails } });
    }
    throw new UserError('Incorrect email or password.');
  }
  if (c.status !== 'ACTIVE') throw new UserError('This account has been suspended. Please contact support.');
  await db.customer.update({ where: { id: c.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  return c;
}

export async function requestReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const c = await db.customer.findUnique({ where: { email } });
  if (!c || c.status !== 'ACTIVE') return; // never reveal whether the email exists
  const raw = await issueToken(c.id, 'PASSWORD_RESET', 60 * 60_000);
  await sendMail(c.email, 'Reset your FYNWYN Drink Bank password', `Use this link to choose a new password (valid for 1 hour):\n${link(`/reset-password?token=${raw}`)}\n\nIf you didn't request this, you can ignore this email.`);
}

export async function resetPassword(input: unknown) {
  const d = resetSchema.parse(input);
  const t = await consumeToken(d.token, 'PASSWORD_RESET');
  await db.customer.update({ where: { id: t.customerId }, data: { passwordHash: await hashPassword(d.password), failedLogins: 0, lockedUntil: null } });
}

export async function changePassword(customerId: string, current: string, next: string) {
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (!(await bcrypt.compare(current, c.passwordHash))) throw new UserError('Your current password is incorrect.');
  resetSchema.shape.password.parse(next);
  await db.customer.update({ where: { id: c.id }, data: { passwordHash: await hashPassword(next) } });
}

// ---------- staff ----------
export async function staffLogin(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const s = await db.staffUser.findUnique({ where: { email } });
  if (s?.lockedUntil && s.lockedUntil > new Date()) throw new UserError('Account temporarily locked. Try again later.');
  const good = await bcrypt.compare(password, s?.passwordHash ?? DUMMY_HASH);
  if (!s || !good || !s.active) {
    if (s) {
      const fails = s.failedLogins + 1;
      await db.staffUser.update({ where: { id: s.id }, data: fails >= 5 ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: fails } });
    }
    throw new UserError('Incorrect email or password.');
  }
  await db.staffUser.update({ where: { id: s.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  return s;
}
