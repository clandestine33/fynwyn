import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Edge gate. Three jobs:
 *  1. Make the staff console invisible (404) unless this deployment/host/IP is allowed to serve it.
 *  2. Keep the customer host free of staff routes (and, when ADMIN_HOST is set, keep the staff host free of customer routes).
 *  3. Cheap cookie checks that bounce unauthenticated users. Real authorisation happens again in
 *     server code (requireStaff / requireCustomer) against the database.
 */
const bool = (v?: string) => (v ?? 'true').toLowerCase() === 'true';
const enc = (s?: string) => new TextEncoder().encode(s ?? '');

const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin');
const CUSTOMER_AREAS = ['/dashboard', '/goals', '/account'];

async function valid(token: string | undefined, secret: string | undefined, aud: string) {
  if (!token || !secret) return false;
  try { await jwtVerify(token, enc(secret), { audience: aud }); return true; } catch { return false; }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = (req.headers.get('host') || '').toLowerCase();
  const adminHost = (process.env.ADMIN_HOST || '').trim().toLowerCase();
  const prod = process.env.NODE_ENV === 'production';
  const notFound = () => NextResponse.rewrite(new URL('/not-found-404', req.url), { status: 404 });

  if (isAdminPath(pathname)) {
    if (!bool(process.env.ADMIN_ENABLED)) return notFound();
    if (adminHost && host !== adminHost) return notFound();
    const allow = (process.env.ADMIN_ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allow.length) {
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
      if (!allow.includes(ip)) return notFound();
    }
    const open = pathname === '/admin/login' || pathname === '/api/admin/health';
    if (!open && !pathname.startsWith('/api/admin')) {
      const ok = await valid(req.cookies.get(prod ? '__Host-fdb_staff' : 'fdb_staff')?.value, process.env.STAFF_SESSION_SECRET, 'staff');
      if (!ok) return NextResponse.redirect(new URL('/admin/login', req.url));
    }
    return NextResponse.next();
  }

  // Dedicated staff host: it serves nothing but the console.
  if (adminHost && host === adminHost && !pathname.startsWith('/_next') && pathname !== '/favicon.ico') {
    return NextResponse.redirect(new URL('/admin', req.url));
  }

  if (CUSTOMER_AREAS.some((a) => pathname === a || pathname.startsWith(a + '/'))) {
    const ok = await valid(req.cookies.get(prod ? '__Host-fdb_session' : 'fdb_session')?.value, process.env.CUSTOMER_SESSION_SECRET, 'customer');
    if (!ok) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'] };
