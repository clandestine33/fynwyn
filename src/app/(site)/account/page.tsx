import type { Metadata } from 'next';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { changePasswordAction } from '@/app/actions/auth';
import { requireCustomer } from '@/lib/session';
import { dateFmt } from '@/components/ui';

export const metadata: Metadata = { title: 'My account' };

export default async function Account() {
  const c = await requireCustomer().catch(() => null);
  if (!c) return null;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-4xl">My account</h1>
      <div className="card mb-4 text-sm">
        <div className="flex justify-between py-1.5"><span className="text-muted">Name</span><span>{c.name}</span></div>
        <div className="flex justify-between py-1.5"><span className="text-muted">Email</span><span>{c.email} {c.emailVerifiedAt ? '✓' : '(unverified)'}</span></div>
        <div className="flex justify-between py-1.5"><span className="text-muted">Member since</span><span>{dateFmt(c.createdAt)}</span></div>
      </div>
      <div className="card">
        <h2 className="text-xl">Change password</h2>
        <ActionForm action={changePasswordAction}>
          <Field label="Current password" name="current" type="password" required autoComplete="current-password" />
          <Field label="New password" name="password" type="password" required minLength={10} autoComplete="new-password" />
          <Field label="Confirm new password" name="confirm" type="password" required minLength={10} autoComplete="new-password" />
          <div className="mt-5"><SubmitButton>Update password</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}
