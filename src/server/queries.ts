import { db } from '@/lib/db';
import { toNaira } from '@/lib/money';
import { savingsPlan } from '@/lib/planner';
import { getBalances } from './ledger';

const n = toNaira;

export async function getSettings() {
  return db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function getPackages() {
  const rows = await db.package.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, include: { benefits: { where: { active: true }, orderBy: [{ milestoneAmount: 'asc' }, { sortOrder: 'asc' }] } } });
  return rows.map((p) => ({
    id: p.id, slug: p.slug, name: p.name, tagline: p.tagline, description: p.description, target: n(p.targetAmount), featured: p.featured,
    benefits: p.benefits.map((b) => ({ id: b.id, title: b.title, description: b.description, milestone: n(b.milestoneAmount) })),
  }));
}
export type PackageDTO = Awaited<ReturnType<typeof getPackages>>[number];

export async function getCatalogue() {
  const rows = await db.product.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  return rows.map((p) => ({ id: p.id, name: p.name, category: p.category, description: p.description, imageUrl: p.imageUrl, price: n(p.unitPrice), available: Math.max(0, p.onHand - p.reserved) }));
}
export type ProductDTO = Awaited<ReturnType<typeof getCatalogue>>[number];

export async function getGoalSummaries(customerId: string) {
  const goals = await db.goal.findMany({ where: { customerId, status: { not: 'CANCELLED' } }, orderBy: [{ status: 'asc' }, { eventDate: 'asc' }], include: { package: true } });
  return Promise.all(goals.map(async (g) => {
    const b = await getBalances(db, g.id);
    const plan = savingsPlan({ target: n(g.targetAmount), saved: n(b.contributed), eventDate: g.eventDate, startDate: g.createdAt });
    return {
      id: g.id, title: g.title, occasion: g.occasion, status: g.status, eventDate: g.eventDate.toISOString(), packageName: g.package.name,
      target: n(g.targetAmount), saved: n(b.contributed), available: n(b.available), plan,
    };
  }));
}
export type GoalSummary = Awaited<ReturnType<typeof getGoalSummaries>>[number];

export async function getGoalDetail(customerId: string, goalId: string) {
  const g = await db.goal.findFirst({
    where: { id: goalId, customerId },
    include: {
      package: { include: { benefits: { where: { active: true }, orderBy: { milestoneAmount: 'asc' } } } },
      payments: { orderBy: { createdAt: 'desc' }, take: 50 },
      orders: { orderBy: { createdAt: 'desc' }, include: { items: true }, take: 50 },
      entitlements: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!g) return null;
  const b = await getBalances(db, g.id);
  const upgrades = await db.package.findMany({ where: { active: true, targetAmount: { gt: g.targetAmount } }, orderBy: { targetAmount: 'asc' } });
  const entByBenefit = new Map(g.entitlements.map((e) => [e.benefitId, e]));
  return {
    id: g.id, title: g.title, occasion: g.occasion, status: g.status, notes: g.notes, guestCount: g.guestCount,
    eventDate: g.eventDate.toISOString(), createdAt: g.createdAt.toISOString(),
    target: n(g.targetAmount),
    package: { id: g.package.id, name: g.package.name, description: g.package.description },
    balances: { contributed: n(b.contributed), available: n(b.available), reserved: n(b.reserved), spent: n(b.spent) },
    plan: savingsPlan({ target: n(g.targetAmount), saved: n(b.contributed), eventDate: g.eventDate, startDate: g.createdAt }),
    benefits: g.package.benefits.map((x) => ({ id: x.id, title: x.title, description: x.description, milestone: n(x.milestoneAmount), status: entByBenefit.get(x.id)?.status ?? null })),
    upgrades: upgrades.map((u) => ({ id: u.id, name: u.name, target: n(u.targetAmount) })),
    payments: g.payments.map((p) => ({ id: p.id, createdAt: p.createdAt.toISOString(), amount: n(p.amount), method: p.method, reference: p.reference, status: p.status, rejectReason: p.rejectReason })),
    orders: g.orders.map((o) => ({ id: o.id, number: o.number, createdAt: o.createdAt.toISOString(), total: n(o.total), status: o.status, cancelReason: o.cancelReason, items: o.items.map((i) => `${i.quantity} × ${i.name}`) })),
    rewards: g.entitlements.map((e) => ({ id: e.id, title: e.titleSnapshot, quantity: e.quantity, status: e.status })),
  };
}
export type GoalDetail = NonNullable<Awaited<ReturnType<typeof getGoalDetail>>>;
