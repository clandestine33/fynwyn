import { describe, expect, it } from 'vitest';
import { savingsPlan } from '@/lib/planner';
import { toKobo, toNaira, formatNaira } from '@/lib/money';

const day = 86_400_000;
const base = new Date('2026-01-01T00:00:00Z');

describe('savingsPlan', () => {
  it('computes weekly and monthly amounts needed', () => {
    const p = savingsPlan({ target: 1_200_000, saved: 0, startDate: base, eventDate: new Date(base.getTime() + 365 * day), now: base });
    expect(p.remaining).toBe(1_200_000);
    expect(p.perMonth).toBe(Math.ceil(1_200_000 / 12));
    expect(p.perWeek).toBe(Math.ceil(1_200_000 / 53));
    expect(p.status).toBe('ON_TRACK');
  });
  it('flags BEHIND when well under the expected pace', () => {
    const p = savingsPlan({ target: 1_000_000, saved: 100_000, startDate: base, eventDate: new Date(base.getTime() + 100 * day), now: new Date(base.getTime() + 50 * day) });
    expect(p.expectedByNow).toBe(500_000);
    expect(p.status).toBe('BEHIND');
  });
  it('is COMPLETE once the target is met and never negative', () => {
    const p = savingsPlan({ target: 100, saved: 250, startDate: base, eventDate: new Date(base.getTime() + 10 * day), now: base });
    expect(p.status).toBe('COMPLETE'); expect(p.remaining).toBe(0); expect(p.perMonth).toBe(0); expect(p.progress).toBe(100);
  });
  it('reports EVENT_PASSED and avoids divide-by-zero for same-day events', () => {
    const past = savingsPlan({ target: 100, saved: 10, startDate: base, eventDate: new Date(base.getTime() + 5 * day), now: new Date(base.getTime() + 9 * day) });
    expect(past.status).toBe('EVENT_PASSED');
    const sameDay = savingsPlan({ target: 100, saved: 0, startDate: base, eventDate: base, now: base });
    expect(Number.isFinite(sameDay.perWeek)).toBe(true);
  });
});

describe('money', () => {
  it('round-trips naira <-> kobo without float drift', () => {
    expect(toKobo(0.1 + 0.2)).toBe(30n);
    expect(toKobo(1999.99)).toBe(199999n);
    expect(toNaira(199999n)).toBe(1999.99);
  });
  it('formats naira', () => { expect(formatNaira(1500)).toBe('₦1,500'); });
});
