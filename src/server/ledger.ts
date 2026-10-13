import type { Tx } from '@/lib/db';
import type { LedgerType } from '@prisma/client';
import { UserError } from '@/lib/errors';

export interface Balances {
  contributed: bigint; // net verified contributions (drives progress & rewards)
  available: bigint;
  reserved: bigint;
  spent: bigint;
}

/** Row-lock a goal for the rest of the transaction so balance checks + writes can't race. */
export async function lockGoal(tx: Tx, goalId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Goal" WHERE id = ${goalId} FOR UPDATE`;
  if (!rows.length) throw new UserError('Plan not found.');
}

export async function getBalances(tx: Tx, goalId: string): Promise<Balances> {
  const rows = await tx.ledgerEntry.groupBy({ by: ['type'], where: { goalId }, _sum: { amount: true } });
  const s = (t: LedgerType) => rows.find((r) => r.type === t)?._sum.amount ?? 0n;
  const contributed = s('CONTRIBUTION') - s('REVERSAL');
  return {
    contributed,
    available: s('CONTRIBUTION') - s('REVERSAL') + s('ADJUSTMENT') - s('RESERVE') + s('RELEASE'),
    reserved: s('RESERVE') - s('RELEASE') - s('SPEND'),
    spent: s('SPEND'),
  };
}
