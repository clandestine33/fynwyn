import type { Metadata } from 'next';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { verifyEmailAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Verify your email', robots: { index: false } };

// Verification needs an explicit click (POST) so email-scanner link prefetching can't consume the token.
export default function Verify({ searchParams }: { searchParams: { token?: string } }) {
  if (!searchParams.token) return <AuthCard title="Link missing" subtitle="This verification link is incomplete. Sign in and request a new one from your dashboard." />;
  return (
    <AuthCard title="Confirm your email" subtitle="One tap and you’re ready to start saving.">
      <ActionForm action={verifyEmailAction} resetOnSuccess={false}>
        <input type="hidden" name="token" value={searchParams.token} />
        <div className="mt-5"><SubmitButton pendingText="Verifying…">Verify my email</SubmitButton></div>
      </ActionForm>
    </AuthCard>
  );
}
