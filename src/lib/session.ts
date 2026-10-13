import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { env } from './env';
import { db } from './db';
import { UserError } from './errors';
import type { StaffRole } from '@prisma/client';

/**
 * Two completely separate session systems:
 *  - customer: cookie `fdb_session`, signed with CUSTOMER_SESSION_SECRET
 *  - staff:    cookie `fdb_staff`,   signed with STAFF_SESSION_SECRET
 * A customer token can never validate as a staff token (different secret + audience) and vice-versa.
 */
export const CUSTOMER_COOKIE = env.isProd ? '__Host-fdb_session' : 'fdb_session';
export const STAFF_COOKIE = env.isProd ? '__Host-fdb_staff' : 'fdb_staff';
const CUSTOMER_TTL = 60 * 60 * 24 * 7;
const STAFF_TTL = 60 * 60 * 8;

async function sign(payload: Record<string, unknown>, secret: Uint8Array, aud: string, ttl: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setAudience(aud).setIssuedAt().setExpirationTime(`${ttl}s`).sign(secret);
}

// ---------- customer ----------
export async function createCustomerSession(customerId: string) {
  const token = await sign({ sub: customerId }, env.customerSecret, 'customer', CUSTOMER_TTL);
  cookies().set(CUSTOMER_COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: 'lax', path: '/', maxAge: CUSTOMER_TTL });
}

export function destroyCustomerSession() {
  cookies().delete(CUSTOMER_COOKIE);
}

export async function getCustomer() {
  const token = cookies().get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.customerSecret, { audience: 'customer' });
    const c = await db.customer.findUnique({ where: { id: String(payload.sub) } });
    return c && c.status === 'ACTIVE' ? c : null;
  } catch {
    return null;
  }
}

export async function requireCustomer() {
  const c = await getCustomer();
  if (!c) throw new UserError('Please sign in to continue.');
  return c;
}

// ---------- staff ----------
export async function createStaffSession(staffId: string, sessionVersion: number) {
  const token = await sign({ sub: staffId, sv: sessionVersion }, env.staffSecret, 'staff', STAFF_TTL);
  cookies().set(STAFF_COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: 'strict', path: '/', maxAge: STAFF_TTL });
}

export function destroyStaffSession() {
  cookies().delete(STAFF_COOKIE);
}

/** Defence in depth: even if a request reaches staff code, refuse unless the deployment allows the console. */
export function assertAdminContext() {
  if (!env.adminEnabled) throw new UserError('Not found');
  const h = headers();
  const host = (h.get('host') || '').toLowerCase();
  if (env.adminHost && host !== env.adminHost) throw new UserError('Not found');
  const allow = env.adminAllowedIps;
  if (allow.length) {
    const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || '';
    if (!allow.includes(ip)) throw new UserError('Not found');
  }
}

export function clientIp(): string | null {
  const h = headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || null;
}

export async function getStaff() {
  try {
    assertAdminContext();
  } catch {
    return null;
  }
  const token = cookies().get(STAFF_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.staffSecret, { audience: 'staff' });
    const s = await db.staffUser.findUnique({ where: { id: String(payload.sub) } });
    if (!s || !s.active || s.sessionVersion !== payload.sv) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Require a signed-in staff member. SUPER_ADMIN always passes; anyone else must hold one of `roles`.
 * Calling it with no roles therefore means "SUPER_ADMIN only".
 */
export async function requireStaff(...roles: StaffRole[]) {
  const s = await getStaff();
  if (!s) throw new UserError('Staff sign-in required.');
  if (s.role !== 'SUPER_ADMIN' && !roles.includes(s.role)) throw new UserError('You do not have permission to do that.');
  return s;
}

/** Any active staff member (read-only pages). */
export async function requireAnyStaff() {
  const s = await getStaff();
  if (!s) throw new UserError('Staff sign-in required.');
  return s;
}
