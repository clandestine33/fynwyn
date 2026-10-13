import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { Badge, Table, dateTimeFmt } from '@/components/ui';
import { RowAction } from '@/components/RowAction';
import { rewardStatusAction } from '../../actions';
import { can, pageGuard } from '../guard';

export const metadata: Metadata = { title: 'Rewards' };

export default async function Rewards() {
  const s = await pageGuard('FINANCE', 'OPERATIONS');
  const rows = await db.rewardEntitlement.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100, include: { goal: { select: { title: true, customer: { select: { name: true, email: true } } } } } });
  const act = can(s.role, 'FINANCE', 'OPERATIONS');
  return (
    <div>
      <h1 className="mb-1 text-3xl">Customer rewards</h1>
      <p className="mb-4 text-sm text-muted">Fulfil only after checking the customer and any physical reward stock. Fulfilled rewards cannot be reverted.</p>
      <Table head={['Earned', 'Customer', 'Plan', 'Reward', 'Qty', 'Status', 'Actions']} empty="No rewards earned yet.">
        {rows.map((r) => (
          <tr key={r.id}><td className="td">{dateTimeFmt(r.createdAt)}</td><td className="td">{r.goal.customer.name}<div className="text-xs text-muted">{r.goal.customer.email}</div></td><td className="td">{r.goal.title}</td><td className="td">{r.titleSnapshot}</td><td className="td">{r.quantity}</td><td className="td"><Badge status={r.status} /></td>
            <td className="td">{act && r.status === 'ELIGIBLE' && <div className="flex flex-col gap-2"><RowAction action={rewardStatusAction} fields={{ id: r.id, to: 'FULFILLED' }} label="Mark fulfilled" confirm="Mark as fulfilled?" /><RowAction action={rewardStatusAction} fields={{ id: r.id, to: 'CANCELLED' }} label="Cancel" tone="danger" confirm="Cancel this reward?" /></div>}</td></tr>
        ))}
      </Table>
    </div>
  );
}
