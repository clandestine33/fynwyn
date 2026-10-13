import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { loginAction } from '@/app/actions/auth';
import { getCustomer } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: { next?: string; reset?: string } }) {
  if (await getCustomer()) redirect('/dashboard');
  const next = searchParams.next ?? '';
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to see your celebration plans." footer={<>New here? <Link className="underline" href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></>}>
      {searchParams.reset && <p className="notice mt-4">Password updated. Please sign in.</p>}
      <ActionForm action={loginAction} resetOnSuccess={false}>
        <input type="hidden" name="next" value={next} />
        <Field label="Email address" name="email" type="email" required autoComplete="email" />
        <Field label="Password" name="password" type="password" required autoComplete="current-password" />
        <div className="mt-5 flex items-center justify-between"><SubmitButton pendingText="Signing in…">Sign in</SubmitButton><Link href="/forgot-password" className="text-sm underline">Forgot password?</Link></div>
      </ActionForm>
    </AuthCard>
  );
}
