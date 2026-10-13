import { db } from '@/lib/db';
import { UserError } from '@/lib/errors';
import { goalSchema } from '@/lib/validators';
import { getBalances, lockGoal } from './ledger';
import { syncGoal } from './rewards';

export async function createGoal(customerId: string, input: unknown) {
  const d = goalSchema.parse(input);
  const pkg = await db.package.findFirst({ where: { id: d.packageId, active: true } });
  if (!pkg) throw new UserError('That package is not available.');
  const open = await db.goal.count({ where: { customerId, status: { in: ['ACTIVE', 'COMPLETED'] } } });
  if (open >= 10) throw new UserError('You can have up to 10 active celebration plans.');

  return db.$transaction(async (tx) => {
    const goal = await tx.goal.create({
      data: { customerId, packageId: pkg.id, title: d.title, occasion: d.occasion, eventDate: d.eventDate, guestCount: d.guestCount, notes: d.notes, targetAmount: pkg.targetAmount },
    });
    await syncGoal(tx, goal.id); // grants "included from the start" benefits
    // If they didn't pick a package when signing up, their first plan's package becomes their selected package.
    await tx.customer.updateMany({ where: { id: customerId, preferredPackageId: null }, data: { preferredPackageId: pkg.id } });
    return goal;
  });
}

/** Upgrades only. Verified credit is untouched; benefits are re-derived from the new package. */
export async function upgradeGoal(customerId: string, goalId: string, packageId: string) {
  return db.$transaction(async (tx) => {
    await lockGoal(tx, goalId);
    const goal = await tx.goal.findFirst({ where: { id: goalId, customerId }, include: { package: true } });
    if (!goal) throw new UserError('Plan not found.');
    if (!['ACTIVE', 'COMPLETED'].includes(goal.status)) throw new UserError('This plan can no longer be changed.');
    const next = await tx.package.findFirst({ where: { id: packageId, active: true } });
    if (!next) throw new UserError('That package is not available.');
    if (next.targetAmount <= goal.package.targetAmount) throw new UserError('Only upgrades to a higher package are allowed. Contact support to downgrade.');
    await tx.goal.update({ where: { id: goalId }, data: { packageId: next.id, targetAmount: next.targetAmount, status: 'ACTIVE' } });
    await tx.customer.update({ where: { id: customerId }, data: { preferredPackageId: next.id } });
    await syncGoal(tx, goalId);
    return next;
  });
}

export async function updateGoalDetails(customerId: string, goalId: string, input: { title: string; eventDate: Date; guestCount?: number; notes?: string }) {
  const goal = await db.goal.findFirst({ where: { id: goalId, customerId } });
  if (!goal) throw new UserError('Plan not found.');
  await db.goal.update({ where: { id: goalId }, data: input });
}

export async function cancelGoal(customerId: string, goalId: string) {
  return db.$transaction(async (tx) => {
    await lockGoal(tx, goalId);
    const goal = await tx.goal.findFirst({ where: { id: goalId, customerId } });
    if (!goal) throw new UserError('Plan not found.');
    const open = await tx.order.count({ where: { goalId, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'OUT_FOR_DELIVERY'] } } });
    if (open) throw new UserError('Cancel or complete your open orders first.');
    const pending = await tx.payment.count({ where: { goalId, status: 'PENDING' } });
    if (pending) throw new UserError('You still have payments awaiting verification.');
    const { available } = await getBalances(tx, goalId);
    if (available > 0n) throw new UserError('This plan still has drink credit. Redeem it or contact support before closing it.');
    await tx.goal.update({ where: { id: goalId }, data: { status: 'CLOSED' } });
  });
}
