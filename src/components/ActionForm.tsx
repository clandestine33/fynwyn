'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { ActionResult } from '@/lib/errors';

type Action = (prev: ActionResult<any> | null, f: FormData) => Promise<ActionResult<any>>;

export function SubmitButton({ children, className = 'btn', pendingText = 'Please wait…' }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={className}>{pending ? pendingText : children}</button>;
}

export function FormMessage({ state }: { state: ActionResult<any> | null }) {
  if (!state) return null;
  if (state.ok) return state.message ? <p role="status" className="notice mt-4">{state.message}</p> : null;
  return <p role="alert" className="notice notice-err mt-4">{state.error}</p>;
}

/** Form wired to a server action: pending state, inline errors/messages, optional reset and redirect-to-URL results. */
export function ActionForm({ action, children, className, resetOnSuccess = true, confirm }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; confirm?: string }) {
  const [state, formAction] = useFormState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (state.data?.url) window.location.href = state.data.url;
      else if (resetOnSuccess) ref.current?.reset();
    }
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function Field({ label, name, type = 'text', className = '', hint, ...rest }: { label: string; name: string; type?: string; className?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} type={type} className="input" {...rest} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
