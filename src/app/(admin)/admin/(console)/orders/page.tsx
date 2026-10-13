import type { Metadata } from 'next';
import Link from 'next/link';
import type { OrderStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { toNaira } from '@/lib/money';
import { Badge, Table, dateFmt, dateTimeFmt, naira } from '@/components/ui';
import { RowAction } from '@/components/RowAction';
import { orderStatusAction } from '../../actions';
import { can, pageGuard } from '../guard';
import { Pager } from '@/components/Pager';

export const metadata: Metadata = { title: 'Orders' };
const STATUSES: OrderStatus[] = ['PENDING_APPROVAL', 'APPROVED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

export default async function Orders({ searchParams }: { searchParams: { status?: string; page?: string } }) {
  const s = await pageGuard('OPERATIONS', 'SUPPORT');
  const status = STATUSES.includes(searchParams.status as OrderStatus) ? (searchParams.status as OrderStatus) : 'PENDING_APPROVAL';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const [rows, total] = await Promise.all([
    db.order.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { items: true, customer: { select: { name: true, email: true } } } }),
    db.order.count({ where: { status } }),
  ]);
  const ops = can(s.role, 'OPERATIONS');
  return (
    <div>
      <h1 className="mb-4 text-3xl">Orders</h1>
      <div className="mb-4 flex flex-wrap gap-2">{STATUSES.map((st) => <Link key={st} href={`/admin/orders?status=${st}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${st === status ? 'bg-accent text-onaccent' : 'bg-surface border border-line'}`}>{st.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Link>)}</div>
      <Table head={['Order', 'Customer', 'Items', 'Total', 'Delivery', 'Status', 'Actions']} empty="No orders in this state.">
        {rows.map((o) => (
          <tr key={o.id}>
            <td className="td font-mono text-xs">{o.number}<div className="font-sans text-muted">{dateTimeFmt(o.createdAt)}</div></td>
            <td className="td">{o.customer.name}<div className="text-xs text-muted">{o.deliveryPhone}</div></td>
            <td className="td">{o.items.map((i) => <div key={i.id}>{i.quantity} × {i.name}</div>)}</td>
            <td className="td font-semibold">{naira(toNaira(o.total))}</td>
            <td className="td max-w-[220px]">{o.deliveryAddress}{o.deliveryDate && <div className="text-xs text-muted">Wanted: {dateFmt(o.deliveryDate)}</div>}{o.deliveryNote && <div className="text-xs text-muted">Note: {o.deliveryNote}</div>}</td>
            <td className="td"><Badge status={o.status} />{o.cancelReason && <div className="mt-1 text-xs text-muted">{o.cancelReason}</div>}</td>
            <td className="td">
              {ops && (
                <div className="flex flex-col gap-2">
                  {o.status === 'PENDING_APPROVAL' && <RowAction action={orderStatusAction} fields={{ id: o.id, to: 'APPROVED' }} label="Approve" />}
                  {o.status === 'APPROVED' && <RowAction action={orderStatusAction} fields={{ id: o.id, to: 'OUT_FOR_DELIVERY' }} label="Out for delivery" tone="secondary" />}
                  {(o.status === 'APPROVED' || o.status === 'OUT_FOR_DELIVERY') && <RowAction action={orderStatusAction} fields={{ id: o.id, to: 'DELIVERED' }} label="Mark delivered" confirm="Mark as delivered? Credit is spent and stock is deducted." />}
                  {['PENDING_APPROVAL', 'APPROVED', 'OUT_FOR_DELIVERY'].includes(o.status) && <RowAction action={orderStatusAction} fields={{ id: o.id, to: 'CANCELLED' }} label="Cancel" tone="danger" reason="Reason" confirm="Cancel and release credit + stock?" />}
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pager base={`/admin/orders?status=${status}`} page={page} total={total} />
    </div>
  );
}
