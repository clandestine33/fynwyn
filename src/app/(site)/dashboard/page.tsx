import type { Metadata } from 'next';
import Link from 'next/link';
import { requireCustomer } from '@/lib/session';
import { getGoalSummaries } from '@/server/queries';
import { Badge, Progress, dateFmt, naira } from '@/components/ui';
import { ResendVerification } from '@/components/ResendVerification';
import { OCCASION_LABEL } from '@/lib/validators';

export const metadata: Metadata = { title: 'My celebration plans' };

export default async function Dashboard({ searchParams }: { searchParams: { verified?: string } }) {
  const c = await requireCustomer().catch(() => null);
  if (!c) return null; // middleware redirects; this is just a type guard
  const goals = await getGoalSummaries(c.id);
  const active = goals.filter((g) => g.status === 'ACTIVE' || g.status === 'COMPLETED');
  const totalSaved = goals.reduce((a, g) => a + g.saved, 0);
  const totalAvail = goals.reduce((a, g) => a + g.available, 0);
  return (
    <div className="wrap py-10">
      <div className="eyebrow">Customer portal</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl">Hello, {c.name.split(' ')[0]}</h1>
        <Link href="/goals/new" className="btn">+ New celebration plan</Link>
      </div>

      {searchParams.verified && <p className="notice mt-4">Email verified — you’re all set to start saving.</p>}
      {!c.emailVerifiedAt && (
        <div className="notice notice-err mt-4 flex flex-wrap items-center justify-between gap-3">
          <span>Please verify your email to add money or redeem. We sent a link to <strong>{c.email}</strong>.</span>
          <ResendVerification />
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4"><div className="text-xs text-muted">Active plans</div><div className="mt-1.5 text-2xl font-extrabold">{active.length}</div></div>
        <div className="rounded-2xl border border-line bg-surface p-4"><div className="text-xs text-muted">Total saved (verified)</div><div className="mt-1.5 text-2xl font-extrabold">{naira(totalSaved)}</div></div>
        <div className="rounded-2xl border border-line bg-surface p-4"><div className="text-xs text-muted">Drink credit available</div><div className="mt-1.5 text-2xl font-extrabold">{naira(totalAvail)}</div></div>
      </div>

      <h2 className="mb-3 mt-10 text-2xl">Your celebrations</h2>
      {goals.length === 0 ? (
        <div className="card text-center">
          <h3 className="text-xl">No plans yet</h3>
          <p className="mx-auto mt-1 max-w-md text-muted">Pick an occasion, a date and a package — we’ll show you how much to set aside each month.</p>
          <Link href="/goals/new" className="btn mt-4">Plan your first celebration</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => (
            <Link key={g.id} href={`/goals/${g.id}`} className="card block transition hover:border-accent">
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-xs text-muted">{OCCASION_LABEL[g.occasion]} · {g.packageName}</div><h3 className="mt-0.5 text-xl">{g.title}</h3></div>
                <Badge status={g.status === 'ACTIVE' ? g.plan.status : g.status} />
              </div>
              <div className="mt-4 flex justify-between text-sm"><span className="text-muted">{naira(g.saved)} of {naira(g.target)}</span><strong>{g.plan.progress.toFixed(0)}%</strong></div>
              <Progress value={g.plan.progress} className="mt-1.5" />
              <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted">
                <span>{dateFmt(g.eventDate)}{g.plan.daysLeft >= 0 ? ` · ${g.plan.daysLeft} day${g.plan.daysLeft === 1 ? '' : 's'} to go` : ' · event passed'}</span>
                <span>Available: <strong className="text-ink">{naira(g.available)}</strong></span>
              </div>
              {g.plan.remaining > 0 && g.plan.daysLeft >= 0 && <div className="mt-2 text-xs text-accent-text">Save about {naira(g.plan.perMonth)} / month to stay on track</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
