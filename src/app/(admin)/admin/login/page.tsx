import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { assertAdminContext, getStaff } from '@/lib/session';
import { staffLoginAction } from '../actions';
import { Logo } from '@/components/Logo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Staff sign-in', robots: { index: false, follow: false } };

export default async function StaffLogin() {
  try { assertAdminContext(); } catch { notFound(); }
  if (await getStaff()) redirect('/admin');
  return (
    <div className="grid min-h-screen place-items-center bg-chrome px-4">
      <div className="w-full max-w-[420px] rounded-[20px] bg-surface p-7">
        <Logo height={40} className="mb-4 block" />
        <span className="rounded bg-accent px-2 py-0.5 text-onaccent text-[10px] font-extrabold uppercase tracking-widest">Staff console</span>
        <h1 className="mt-3 text-3xl">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Authorised FYNWYN staff only. Activity is logged.</p>
        <ActionForm action={staffLoginAction} resetOnSuccess={false}>
          <Field label="Work email" name="email" type="email" required autoComplete="username" />
          <Field label="Password" name="password" type="password" required autoComplete="current-password" />
          <div className="mt-5"><SubmitButton pendingText="Signing in…">Sign in</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}
