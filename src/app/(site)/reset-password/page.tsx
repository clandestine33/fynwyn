import type { Metadata } from 'next';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { resetAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

export default function Reset({ searchParams }: { searchParams: { token?: string } }) {
  if (!searchParams.token) return <AuthCard title="Link missing" subtitle="This reset link is incomplete. Please request a new one." />;
  return (
    <AuthCard title="Choose a new password">
      <ActionForm action={resetAction} resetOnSuccess={false}>
        <input type="hidden" name="token" value={searchParams.token} />
        <Field label="New password" name="password" type="password" required minLength={10} autoComplete="new-password" hint="At least 10 characters, with letters and numbers." />
        <Field label="Confirm password" name="confirm" type="password" required minLength={10} autoComplete="new-password" />
        <div className="mt-5"><SubmitButton>Update password</SubmitButton></div>
      </ActionForm>
    </AuthCard>
  );
}
