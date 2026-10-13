import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/session';
import type { StaffRole } from '@prisma/client';

/** Page-level guard (the server actions re-check independently). SUPER_ADMIN always passes. */
export async function pageGuard(...roles: StaffRole[]) {
  const s = await getStaff();
  if (!s) redirect('/admin/login');
  if (roles.length && s.role !== 'SUPER_ADMIN' && !roles.includes(s.role)) redirect('/admin?denied=1');
  return s;
}
export const can = (role: StaffRole, ...allowed: StaffRole[]) => role === 'SUPER_ADMIN' || allowed.includes(role);
