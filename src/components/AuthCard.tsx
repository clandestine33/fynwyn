import type { ReactNode } from 'react';
import { Logo } from './Logo';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto my-10 w-full max-w-[520px] px-4">
      <div className="rounded-[20px] border border-line bg-surface p-7 shadow-card">
        <Logo height={36} className="mb-4 block" />
        <h1 className="text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
        {children}
      </div>
      {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
