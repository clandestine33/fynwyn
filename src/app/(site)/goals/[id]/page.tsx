import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCustomer } from '@/lib/session';
import { env } from '@/lib/env';
import { getCatalogue, getGoalDetail } from '@/server/queries';
import { Badge, Progress, Stat, dateFmt, naira } from '@/components/ui';
import { GoalTabs } from '@/components/GoalTabs';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { closeGoalAction, updateGoalAction, upgradeGoalAction } from '@/app/actions/customer';
import { OCCASION_LABEL } from '@/lib/validators';

export const metadata: Metadata = { title: 'Celebration plan' };
export const dynamic = 'force-dynamic';

const PLAN_COPY = { COMPLETE: 'Target reached — you’re ready to redeem!', ON_TRACK: 'You’re on track', BEHIND: 'A little behind schedule', EVENT_PASSED: 'The event date has passed' } as const;

export default async function GoalPage({ params, searchParams }: { params: { id: string }; searchParams: { created?: string; pay?: string } }) {
  const c = await requireCustomer().catch(() => null);
  if (!c) return null;
  const [goal, products] = await Promise.all([getGoalDetail(c.id, params.id), getCatalogue()]);
  if (!goal) notFound();
  const { plan, balances } = goal;
  const closed = !['ACTIVE', 'COMPLETED'].includes(goal.status);

  return (
    <div className="wrap py-8">
      <Link href="/dashboard" className="text-sm text-muted hover:underline">← All plans</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">{OCCASION_LABEL[goal.occasion]} · {goal.package.name} package</div>
          <h1 className="mt-1 text-4xl">{goal.title}</h1>
          <p className="mt-1 text-muted">{dateFmt(goal.eventDate)}{plan.daysLeft >= 0 ? ` · ${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'} to go` : ''}{goal.guestCount ? ` · ${goal.guestCount} guests` : ''}</p>
        </div>
        <Badge status={goal.status} />
      </div>

      {searchParams.created && <p className="notice mt-4">Your plan is ready. Add your first contribution below to start building credit.</p>}
      {searchParams.pay === 'verified' && <p className="notice mt-4">Payment received — your credit has been added. 🎉</p>}
      {searchParams.pay === 'pending' && <p className="notice mt-4">We’re confirming your payment. This page will show your credit shortly — refresh in a moment.</p>}
      {(searchParams.pay === 'failed') && <p className="notice notice-err mt-4">That payment didn’t go through. You haven’t been charged.</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available drink credit" value={naira(balances.available)} />
        <Stat label="Verified contributions" value={naira(balances.contributed)} />
        <Stat label="Reserved for orders" value={naira(balances.reserved)} />
        <Stat label="Credit spent" value={naira(balances.spent)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card">
          <div className="flex items-start justify-between gap-3">
            <div><strong>{goal.package.name}</strong><div className="text-sm text-muted">{goal.package.description}</div></div>
            <div className="text-right"><strong>{naira(goal.target)}</strong><div className="text-xs text-muted">target</div></div>
          </div>
          <Progress value={plan.progress} className="mt-4" />
          <div className="mt-2 flex justify-between text-sm"><span className="text-muted">Savings progress</span><strong>{plan.progress.toFixed(1)}% · {naira(plan.remaining)} to go</strong></div>
          {!closed && (
            <div className="mt-4 rounded-xl bg-tint p-3 text-sm">
              <div className="font-semibold">{PLAN_COPY[plan.status]}</div>
              {plan.remaining > 0 && plan.daysLeft >= 0 && <div className="mt-0.5 text-muted">Save about <strong className="text-ink">{naira(plan.perMonth)}</strong> a month or <strong className="text-ink">{naira(plan.perWeek)}</strong> a week to hit your target by the event.</div>}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl">Package perks</h2>
          <ul className="mt-3 space-y-3">
            {goal.benefits.map((b) => (
              <li key={b.id} className="flex items-start gap-3 text-sm">
                <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${b.status ? 'bg-accent text-onaccent' : 'bg-track text-muted'}`}>{b.status ? '✓' : '•'}</span>
                <span><span className={b.status ? 'font-semibold' : ''}>{b.title}</span><span className="block text-xs text-muted">{b.milestone > 0 ? `Unlocks at ${naira(b.milestone)} saved` : 'Included'}{b.status === 'FULFILLED' ? ' · delivered' : b.status === 'ELIGIBLE' ? ' · unlocked' : ''}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <GoalTabs goal={goal} products={products} paystack={env.paystackEnabled} bank={env.bank} canTransact={!!c.emailVerifiedAt} initialTab={searchParams.pay ? 'payments' : undefined} />

      {!closed && (
        <details className="card mt-8">
          <summary className="cursor-pointer font-semibold">Plan settings</summary>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <ActionForm action={updateGoalAction} resetOnSuccess={false}>
              <h3 className="text-lg">Edit details</h3>
              <input type="hidden" name="goalId" value={goal.id} />
              <Field label="Name" name="title" defaultValue={goal.title} required />
              <Field label="Event date" name="eventDate" type="date" defaultValue={goal.eventDate.slice(0, 10)} required />
              <Field label="Guests" name="guestCount" type="number" defaultValue={goal.guestCount ?? ''} />
              <div className="mt-4"><SubmitButton className="btn btn-secondary">Save changes</SubmitButton></div>
            </ActionForm>
            <div>
              {goal.upgrades.length > 0 && (
                <ActionForm action={upgradeGoalAction} resetOnSuccess={false}>
                  <h3 className="text-lg">Upgrade package</h3>
                  <input type="hidden" name="goalId" value={goal.id} />
                  <label htmlFor="packageId" className="label">New package</label>
                  <select id="packageId" name="packageId" className="input">{goal.upgrades.map((u) => <option key={u.id} value={u.id}>{u.name} — {naira(u.target)}</option>)}</select>
                  <p className="mt-1 text-xs text-muted">Your verified credit carries over. Downgrades need support.</p>
                  <div className="mt-4"><SubmitButton className="btn btn-secondary">Upgrade</SubmitButton></div>
                </ActionForm>
              )}
              <ActionForm action={closeGoalAction} resetOnSuccess={false} confirm="Close this plan? This cannot be undone.">
                <h3 className="mt-6 text-lg">Close plan</h3>
                <input type="hidden" name="goalId" value={goal.id} />
                <p className="text-xs text-muted">Only possible once all credit is redeemed and no orders or payments are pending.</p>
                <div className="mt-3"><SubmitButton className="btn btn-danger btn-sm">Close this plan</SubmitButton></div>
              </ActionForm>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
