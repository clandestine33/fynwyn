import type { Metadata } from 'next';
import { GoalWizard } from '@/components/GoalWizard';
import { getPackages } from '@/server/queries';

export const metadata: Metadata = { title: 'New celebration plan' };

export default async function NewGoal({ searchParams }: { searchParams: { package?: string; welcome?: string } }) {
  const packages = await getPackages();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="eyebrow">{searchParams.welcome ? 'Welcome — let’s get started' : 'New plan'}</div>
      <h1 className="mb-1 mt-2 text-4xl">Plan your celebration</h1>
      <p className="mb-6 text-muted">Tell us about the occasion. You can change the date and upgrade your package later.</p>
      <div className="card"><GoalWizard packages={packages} initialPackageId={searchParams.package} /></div>
    </div>
  );
}
