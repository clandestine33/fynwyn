/** Pure savings-plan maths. No I/O so it is trivially testable and usable on server and client. */
const DAY = 86_400_000;

export interface PlanInput {
  target: number; // naira
  saved: number; // naira (net verified contributions)
  eventDate: Date;
  startDate: Date; // when the goal was created
  now?: Date;
}

export interface Plan {
  remaining: number;
  progress: number; // 0..100
  daysLeft: number;
  perWeek: number;
  perMonth: number;
  status: 'COMPLETE' | 'ON_TRACK' | 'BEHIND' | 'EVENT_PASSED';
  expectedByNow: number;
}

export function savingsPlan({ target, saved, eventDate, startDate, now = new Date() }: PlanInput): Plan {
  const remaining = Math.max(0, target - saved);
  const progress = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
  const daysLeft = Math.ceil((eventDate.getTime() - now.getTime()) / DAY);
  const total = Math.max(1, (eventDate.getTime() - startDate.getTime()) / DAY);
  const elapsed = Math.min(total, Math.max(0, (now.getTime() - startDate.getTime()) / DAY));
  const expectedByNow = Math.round(target * (elapsed / total));

  const weeks = Math.max(1, Math.ceil(daysLeft / 7));
  const months = Math.max(1, Math.ceil(daysLeft / 30.4375));
  const perWeek = remaining === 0 ? 0 : Math.ceil(remaining / weeks);
  const perMonth = remaining === 0 ? 0 : Math.ceil(remaining / months);

  let status: Plan['status'];
  if (remaining === 0) status = 'COMPLETE';
  else if (daysLeft < 0) status = 'EVENT_PASSED';
  else status = saved >= expectedByNow * 0.95 ? 'ON_TRACK' : 'BEHIND';

  return { remaining, progress, daysLeft, perWeek, perMonth, status, expectedByNow };
}
