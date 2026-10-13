'use client';
import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { ActionResult } from '@/lib/errors';

type Action = (prev: ActionResult<any> | null, f: FormData) => Promise<ActionResult<any>>;

function Btn({ label, tone }: { label: string; tone: string }) {
  const { pending } = useFormStatus();
  const cls = tone === 'danger' ? 'btn btn-danger btn-sm' : tone === 'secondary' ? 'btn btn-secondary btn-sm' : 'btn btn-sm';
  return <button type="submit" disabled={pending} className={cls}>{pending ? '…' : label}</button>;
}

/** Compact inline action button for table rows, with optional reason input and confirm prompt. */
export function RowAction({ action, fields, label, tone = 'primary', reason, confirm }: {
  action: Action; fields: Record<string, string>; label: string; tone?: 'primary' | 'secondary' | 'danger'; reason?: string; confirm?: string;
}) {
  const [state, formAction] = useFormState(action, null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (state) setMsg(state.ok ? state.message ?? 'Done' : state.error); }, [state]);
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-1.5" onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {reason !== undefined && <input name="reason" placeholder={reason || 'Reason'} aria-label="Reason" className="input !w-36 !py-1 text-xs" />}
      <Btn label={label} tone={tone} />
      {msg && <span role="status" className={`basis-full text-[11px] ${state && !state.ok ? 'text-danger-text' : 'text-muted'}`}>{msg}</span>}
    </form>
  );
}
