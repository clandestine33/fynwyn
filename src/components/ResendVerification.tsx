'use client';
import { useFormState } from 'react-dom';
import { resendVerificationAction } from '@/app/actions/auth';
import { SubmitButton } from './ActionForm';

export function ResendVerification() {
  const [state, action] = useFormState(async () => resendVerificationAction(), null);
  return (
    <form action={action} className="inline-flex items-center gap-3">
      <SubmitButton className="btn btn-secondary btn-sm">Resend email</SubmitButton>
      {state && <span className="text-xs">{state.ok ? state.message : state.error}</span>}
    </form>
  );
}
