import type { ReactNode } from 'react';
import { formatNaira } from '@/lib/money';

export const naira = formatNaira;

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-track ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1.5 text-2xl font-extrabold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const TONE: Record<string, string> = {
  green: 'bg-[#e3f1e6] text-[#1d6b3a] dark:bg-[#16301f] dark:text-[#7fd39a]',
  amber: 'bg-[#fbf0d9] text-[#7a5c16] dark:bg-[#3a2e14] dark:text-[#f0c978]',
  red: 'bg-[#fbe6e3] text-[#9b2c20] dark:bg-[#3a1f1b] dark:text-[#ffb4a8]',
  grey: 'bg-[#ecebe8] text-[#5c5852] dark:bg-[#2f2b28] dark:text-[#bdb6ad]',
  blue: 'bg-[#e4edf7] text-[#24578f] dark:bg-[#172a3d] dark:text-[#8ec1f5]',
};
const STATUS_TONE: Record<string, string> = {
  VERIFIED: 'green', DELIVERED: 'green', FULFILLED: 'green', COMPLETED: 'green', ACTIVE: 'blue', APPROVED: 'blue', ON_TRACK: 'green',
  PENDING: 'amber', PENDING_APPROVAL: 'amber', ELIGIBLE: 'amber', OUT_FOR_DELIVERY: 'blue', BEHIND: 'amber',
  REJECTED: 'red', FAILED: 'red', REVERSED: 'red', CANCELLED: 'grey', CLOSED: 'grey', SUSPENDED: 'red', EVENT_PASSED: 'red',
};
export function Badge({ status, label }: { status: string; label?: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE[STATUS_TONE[status] ?? 'grey']}`}>{label ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  if (!hasRows) return <p className="text-sm text-muted">{empty ?? 'Nothing to show yet.'}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[560px] border-collapse">
        <thead><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const dateFmt = (d: string | Date) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateTimeFmt = (d: string | Date) => new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
