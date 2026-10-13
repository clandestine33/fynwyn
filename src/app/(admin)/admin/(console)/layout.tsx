import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/session';
import { staffLogoutAction } from '../actions';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: 'Staff console', template: '%s · Staff' }, robots: { index: false, follow: false } };

const NAV: [string, string, string[] | null][] = [
  ['/admin', 'Overview', null],
  ['/admin/payments', 'Payments', ['FINANCE', 'SUPPORT']],
  ['/admin/orders', 'Orders', ['OPERATIONS', 'SUPPORT']],
  ['/admin/customers', 'Customers', null],
  ['/admin/inventory', 'Inventory', ['OPERATIONS']],
  ['/admin/packages', 'Packages', ['OPERATIONS', 'FINANCE']],
  ['/admin/rewards', 'Rewards', ['FINANCE', 'OPERATIONS']],
  ['/admin/settings', 'Settings', []],
  ['/admin/staff', 'Staff', []],
  ['/admin/audit', 'Audit log', []],
];

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const s = await getStaff();
  if (!s) redirect('/admin/login');
  const visible = NAV.filter(([, , roles]) => roles === null || s.role === 'SUPER_ADMIN' || roles.includes(s.role));
  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-40 bg-chrome text-white">
        <div className="wrap flex flex-wrap items-center justify-between gap-3 py-2 sm:py-3">
          <div className="flex items-center gap-3"><Logo height={30} onDark /><span className="hidden font-extrabold tracking-[.07em] sm:inline">FYNWYN</span><span className="rounded bg-accent px-2 py-0.5 text-onaccent text-[10px] font-extrabold uppercase tracking-widest">Staff console</span></div>
          <div className="flex items-center gap-3 text-sm"><span className="hidden text-[#b0b0b0] sm:inline">{s.name} · {s.role.replace('_', ' ').toLowerCase()}</span><ThemeToggle /><form action={staffLogoutAction}><button className="rounded-full border border-[#444444] px-3 py-1.5 hover:bg-white/10">Sign out</button></form></div>
        </div>
        <nav className="wrap flex gap-1 overflow-x-auto whitespace-nowrap pb-2 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Console">
          {visible.map(([href, label]) => <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-[#d4d4d4] hover:bg-white/10 hover:text-white">{label}</Link>)}
        </nav>
      </header>
      <div className="wrap py-8">{children}</div>
    </div>
  );
}
