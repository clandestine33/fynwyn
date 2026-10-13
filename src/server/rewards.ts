import type { Tx } from '@/lib/db';
import { getBalances } from './ledger';

/**
 * Re-derive goal status and reward entitlements from the ledger. Call inside the same
 * transaction after any contribution, reversal, adjustment or package change.
 */
export async function syncGoal(tx: Tx, goalId: string) {
  const goal = await tx.goal.findUniqueOrThrow({ where: { id: goalId }, include: { package: { include: { benefits: { where: { active: true } } } } } });
  const { contributed } = await getBalances(tx, goalId);

  for (const b of goal.package.benefits) {
    const earned = contributed >= b.milestoneAmount;
    const existing = await tx.rewardEntitlement.findUnique({ where: { goalId_benefitId: { goalId, benefitId: b.id } } });
    if (earned && !existing) {
      await tx.rewardEntitlement.create({ data: { goalId, benefitId: b.id, titleSnapshot: b.title, quantity: b.quantity } });
    } else if (earned && existing?.status === 'CANCELLED') {
      await tx.rewardEntitlement.update({ where: { id: existing.id }, data: { status: 'ELIGIBLE' } });
    } else if (!earned && existing?.status === 'ELIGIBLE') {
      await tx.rewardEntitlement.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
    }
  }

  if (goal.status === 'ACTIVE' && contributed >= goal.targetAmount) await tx.goal.update({ where: { id: goalId }, data: { status: 'COMPLETED' } });
  else if (goal.status === 'COMPLETED' && contributed < goal.targetAmount) await tx.goal.update({ where: { id: goalId }, data: { status: 'ACTIVE' } });
}
