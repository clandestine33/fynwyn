import type { Metadata } from 'next';
import Link from 'next/link';
import type { PaymentStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { toNaira } from '@/lib/money';
import { Badge, Table, dateTimeFmt, naira } from '@/components/ui';
import { RowAction } from '@/components/RowAction';
import { rejectPaymentAction, reversePaymentAction, verifyPaymentAction } from '../../actions';
import { can, pageGuard } from '../guard';
import { Pager } from '@/components/Pager';

export const metadata: Metadata = { title: 'Payments' };
const STATUSES: PaymentStatus[] = ['PENDING', 'VERIFIED', 'REJECTED', 'REVERSED', 'FAILED'];

export default async function Payments({ searchParams }: { searchParams: { status?: string; page?: string } }) {
  const s = await pageGuard('FINANCE', 'SUPPORT');
  const status = STATUSES.includes(searchParams.status as PaymentStatus) ? (searchParams.status as PaymentStatus) : 'PENDING';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const [rows, total] = await Promise.all([
    db.payment.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { customer: { select: { name: true, email: true } }, goal: { select: { title: true } } } }),
    db.payment.count({ where: { status } }),
  ]);
  const finance = can(s.role, 'FINANCE');
  return (
    <div>
      <h1 className="mb-1 text-3xl">Payments</h1>
      <p className="mb-4 text-sm text-muted">Verify bank transfers against actual bank records before approving. Online (Paystack) payments are verified automatically. Reversal adjusts the ledger only — process any cash refund separately.</p>
      <div className="mb-4 flex flex-wrap gap-2">{STATUSES.map((st) => <Link key={st} href={`/admin/payments?status=${st}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${st === status ? 'bg-accent text-onaccent' : 'bg-surface border border-line'}`}>{st.charAt(0) + st.slice(1).toLowerCase()}</Link>)}</div>
      <Table head={['Date', 'Customer', 'Plan', 'Amount', 'Method / reference', 'Status', 'Actions']} empty={`No ${status.toLowerCase()} payments.`}>
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="td">{dateTimeFmt(p.createdAt)}</td>
            <td className="td">{p.customer.name}<div className="text-xs text-muted">{p.customer.email}</div></td>
            <td className="td">{p.goal.title}</td>
            <td className="td font-semibold">{naira(toNaira(p.amount))}</td>
            <td className="td">{p.method === 'PAYSTACK' ? 'Paystack' : 'Transfer'}<div className="font-mono text-xs">{p.reference}</div>{p.proofUrl && <a href={p.proofUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">Receipt</a>}</td>
            <td className="td"><Badge status={p.status} />{p.rejectReason && <div className="mt-1 text-xs text-muted">{p.rejectReason}</div>}</td>
            <td className="td">
              {finance && p.status === 'PENDING' && p.method === 'BANK_TRANSFER' && (
                <div className="flex flex-col gap-2">
                  <RowAction action={verifyPaymentAction} fields={{ id: p.id }} label="Verify" confirm={`Confirm you have seen ${naira(toNaira(p.amount))} (ref ${p.reference}) in the bank statement?`} />
                  <RowAction action={rejectPaymentAction} fields={{ id: p.id }} label="Reject" tone="danger" reason="Reason" />
                </div>
              )}
              {finance && p.status === 'VERIFIED' && <RowAction action={reversePaymentAction} fields={{ id: p.id }} label="Reverse credit" tone="danger" reason="Reason (required)" confirm="Reverse this payment's credit?" />}
            </td>
          </tr>
        ))}
      </Table>
      <Pager base={`/admin/payments?status=${status}`} page={page} total={total} />
    </div>
  );
}
