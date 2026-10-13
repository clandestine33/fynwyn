import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { registerAction } from '@/app/actions/auth';
import { getCustomer } from '@/lib/session';
import { getPackages, getSettings } from '@/server/queries';
import { naira } from '@/components/ui';

export const metadata: Metadata = { title: 'Create your account' };

export default async function Register({ searchParams }: { searchParams: { next?: string; package?: string } }) {
  if (await getCustomer()) redirect('/dashboard');
  const [s, packages] = await Promise.all([getSettings(), getPackages()]);
  const next = searchParams.next ?? '';
  // If they arrived from "Choose <package>" the package id rides along in the `next` URL.
  const fromNext = /[?&]package=([^&]+)/.exec(next)?.[1];
  const defaultPkg = packages.find((p) => p.id === (searchParams.package ?? fromNext))?.id ?? '';
  if (!s.registrationOpen) return <AuthCard title="Registration is closed" subtitle="New sign-ups are paused right now. Please check back soon." />;
  return (
    <AuthCard title="Start your Drink Bank" subtitle="It takes a minute. No payment needed to join." footer={<>Already have an account? <Link className="underline" href="/login">Sign in</Link></>}>
      <ActionForm action={registerAction} resetOnSuccess={false}>
        <input type="hidden" name="next" value={next} />
        <Field label="Full name" name="name" required autoComplete="name" />
        <Field label="Email address" name="email" type="email" required autoComplete="email" />
        <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" />
        <label htmlFor="preferredPackageId" className="label">Preferred package (optional)</label>
        <select id="preferredPackageId" name="preferredPackageId" className="input" defaultValue={defaultPkg}>
          <option value="">Not sure yet</option>
          {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {naira(p.target)}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">You can change this any time when you create a plan.</p>
        <Field label="Password" name="password" type="password" required minLength={10} autoComplete="new-password" hint="At least 10 characters, with letters and numbers." />
        <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" name="acceptTerms" required className="mt-1" /><span>I agree to the <Link href="/legal" target="_blank" className="underline">campaign terms &amp; privacy notice</Link> (v{s.termsVersion}).</span></label>
        <div className="mt-5"><SubmitButton pendingText="Creating account…">Create account</SubmitButton></div>
      </ActionForm>
    </AuthCard>
  );
}
