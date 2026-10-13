'use client';
import { useMemo, useState } from 'react';
import { ActionForm, Field, SubmitButton } from './ActionForm';
import { createGoalAction } from '@/app/actions/customer';
import { OCCASIONS, OCCASION_LABEL } from '@/lib/validators';
import { savingsPlan } from '@/lib/planner';
import { naira } from './ui';
import type { PackageDTO } from '@/server/queries';

export function GoalWizard({ packages, initialPackageId }: { packages: PackageDTO[]; initialPackageId?: string }) {
  const [pkgId, setPkgId] = useState(packages.find((p) => p.id === initialPackageId)?.id ?? packages.find((p) => p.featured)?.id ?? packages[0]?.id ?? '');
  const [date, setDate] = useState('');
  const pkg = packages.find((p) => p.id === pkgId);
  const minDate = useMemo(() => new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10), []);
  const plan = pkg && date ? savingsPlan({ target: pkg.target, saved: 0, eventDate: new Date(date), startDate: new Date() }) : null;

  return (
    <ActionForm action={createGoalAction} resetOnSuccess={false}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Name your celebration" name="title" required maxLength={80} placeholder="e.g. Tolu & Bisi’s wedding" className="sm:col-span-2" />
        <div>
          <label htmlFor="occasion" className="label">Occasion</label>
          <select id="occasion" name="occasion" className="input" defaultValue="BIRTHDAY">{OCCASIONS.map((o) => <option key={o} value={o}>{OCCASION_LABEL[o]}</option>)}</select>
        </div>
        <Field label="Event date" name="eventDate" type="date" required min={minDate} value={date} onChange={(e) => setDate(e.target.value)} />
        <Field label="Expected guests (optional)" name="guestCount" type="number" min={1} max={100000} />
        <div><label htmlFor="notes" className="label">Notes (optional)</label><input id="notes" name="notes" maxLength={500} className="input" placeholder="Venue, theme, anything we should know" /></div>
      </div>

      <fieldset className="mt-6">
        <legend className="label !mt-0">Choose a package</legend>
        <input type="hidden" name="packageId" value={pkgId} />
        <div className="grid gap-3 sm:grid-cols-2">
          {packages.map((p) => (
            <button type="button" key={p.id} onClick={() => setPkgId(p.id)} aria-pressed={pkgId === p.id}
              className={`rounded-2xl border p-4 text-left transition ${pkgId === p.id ? 'border-primary bg-tint ring-2 ring-primary' : 'border-line bg-surface hover:border-accent'}`}>
              <div className="flex items-center justify-between"><span className="pill">{p.name}</span>{p.featured && <span className="text-[11px] font-bold text-accent-text">Popular</span>}</div>
              <div className="mt-2 text-xl font-extrabold">{naira(p.target)}</div>
              <div className="mt-1 text-xs text-muted">{p.tagline}</div>
              <ul className="mt-2 space-y-1 text-xs">{p.benefits.slice(0, 3).map((b) => <li key={b.id}>✓ {b.title}</li>)}</ul>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="notice mt-6" aria-live="polite">
        {plan && pkg ? (
          plan.daysLeft < 0 ? 'Pick a future date.' : <>To reach <strong>{naira(pkg.target)}</strong> in <strong>{plan.daysLeft} days</strong>, set aside about <strong>{naira(plan.perMonth)} / month</strong> or <strong>{naira(plan.perWeek)} / week</strong>.</>
        ) : 'Pick a date and package to see your suggested savings schedule.'}
      </div>
      <div className="mt-5"><SubmitButton pendingText="Creating plan…">Create my plan</SubmitButton></div>
    </ActionForm>
  );
}
