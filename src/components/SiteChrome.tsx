import Link from 'next/link';
import { getCustomer } from '@/lib/session';
import { logoutAction } from '@/app/actions/auth';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export async function Header() {
  const c = await getCustomer();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-chrome text-white">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 sm:py-3.5">
        <Link href="/" className="flex items-center gap-3 text-[19px] font-extrabold tracking-[.07em]" aria-label="FYNWYN Drink Bank home">
          <Logo height={36} onDark />
          <span className="hidden sm:block">FYNWYN <small className="block text-[10px] font-medium tracking-[.2em] text-accent-light">DRINK BANK</small></span>
        </Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Main">
          <Link href="/#packages" className="hidden rounded-full border border-[#4a4a4a] px-3 py-1.5 text-[13px] hover:bg-white/10 sm:px-3.5 sm:py-2 sm:text-sm sm:inline-block">Packages</Link>
          <Link href="/drinks" className="rounded-full border border-[#4a4a4a] px-3 py-1.5 text-[13px] hover:bg-white/10 sm:px-3.5 sm:py-2 sm:text-sm">Drinks</Link>
          <ThemeToggle />
          {c ? (
            <>
              <Link href="/dashboard" className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-onaccent sm:px-4 sm:py-2 sm:text-sm hover:bg-accent-light">My plans</Link>
              <form action={logoutAction}><button className="rounded-full border border-[#4a4a4a] px-3 py-1.5 text-[13px] hover:bg-white/10 sm:px-3.5 sm:py-2 sm:text-sm">Sign out</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-full border border-[#4a4a4a] px-3 py-1.5 text-[13px] hover:bg-white/10 sm:px-3.5 sm:py-2 sm:text-sm">Sign in</Link>
              <Link href="/register" className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-onaccent sm:px-4 sm:py-2 sm:text-sm hover:bg-accent-light">Join free</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Footer({ supportEmail }: { supportEmail?: string | null }) {
  return (
    <footer className="mt-16 bg-footer py-8 text-xs text-muted">
      <div className="wrap flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3"><Logo height={22} /> © {new Date().getFullYear()} FYNWYN Group Enterprises · FYNWYN Drink Bank</span>
        <span className="flex gap-4">
          <Link href="/legal" className="hover:underline">Terms &amp; privacy</Link>
          {supportEmail && <a href={`mailto:${supportEmail}`} className="hover:underline">{supportEmail}</a>}
        </span>
      </div>
    </footer>
  );
}
