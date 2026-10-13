import type { Metadata } from 'next';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { forgotAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Reset password' };

export default function Forgot() {
  return (
    <AuthCard title="Reset your password" subtitle="Enter your email and we’ll send a one-time reset link.">
      <ActionForm action={forgotAction}>
        <Field label="Email address" name="email" type="email" required autoComplete="email" />
        <div className="mt-5"><SubmitButton>Send reset link</SubmitButton></div>
      </ActionForm>
    </AuthCard>
  );
}
