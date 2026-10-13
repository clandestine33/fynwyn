import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { toNaira } from '@/lib/money';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { RowAction } from '@/components/RowAction';
import { Badge, Table, dateFmt, naira } from '@/components/ui';
import { getBalances } from '@/server/ledger';
import { adjustCreditAction, customerStatusAction } from '../../../actions';
import { can, pageGuard } from '../../guard';

export const metadata: Metadata = { title: 'Customer' };

export default async function CustomerDetail({ params }: { params: { id: string } }) {
  const s = await pageGuard();
  const c = await db.customer.findUnique({ where: { id: params.id }, include: { goals: { include: { package: true }, orderBy: { createdAt: 'desc' } } } });
  if (!c) notFound();
  const goals = await Promise.all(c.goals.map(async (g) => ({ g, b: await getBalances(db, g.id) })));
  return (
    <div>
      <Link href="/admin/customers" className="text-sm text-muted hover:underline">← Customers</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-3xl">{c.name}</h1><p className="text-muted">{c.email}{c.phone ? ` · ${c.phone}` : ''} · joined {dateFmt(c.createdAt)} · {c.emailVerifiedAt ? 'email verified' : 'email NOT verified'}</p></div>
        <div className="flex items-center gap-3"><Badge status={c.status} />
          {can(s.role, 'FINANCE') && <RowAction action={customerStatusAction} fields={{ id: c.id, to: c.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }} label={c.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'} tone={c.status === 'ACTIVE' ? 'danger' : 'secondary'} confirm="Change this customer's access?" />}
        </div>
      </div>
      <h2 className="mb-3 mt-8 text-xl">Plans</h2>
      <Table head={['Plan', 'Package', 'Event', 'Target', 'Verified', 'Available', 'Reserved', 'Spent', 'Status']} empty="No plans.">
        {goals.map(({ g, b }) => (
          <tr key={g.id}><td className="td font-semibold">{g.title}</td><td className="td">{g.package.name}</td><td className="td">{dateFmt(g.eventDate)}</td><td className="td">{naira(toNaira(g.targetAmount))}</td>
            <td className="td">{naira(toNaira(b.contributed))}</td><td className="td">{naira(toNaira(b.available))}</td><td className="td">{naira(toNaira(b.reserved))}</td><td className="td">{naira(toNaira(b.spent))}</td><td className="td"><Badge status={g.status} /></td></tr>
        ))}
      </Table>
      {can(s.role, 'FINANCE') && goals.length > 0 && (
        <div className="card mt-6 max-w-xl">
          <h2 className="text-xl">Manual credit adjustment</h2>
          <p className="text-sm text-muted">Use for corrections only (positive adds credit, negative removes). A reason is mandatory and the action is audited.</p>
          <ActionForm action={adjustCreditAction}>
            <label htmlFor="goalId" className="label">Plan</label>
            <select id="goalId" name="goalId" className="input">{goals.map(({ g }) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
            <Field label="Amount (₦, negative to deduct)" name="amount" type="number" step="1" required />
            <Field label="Reason" name="note" required />
            <div className="mt-4"><SubmitButton className="btn btn-secondary">Apply adjustment</SubmitButton></div>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
