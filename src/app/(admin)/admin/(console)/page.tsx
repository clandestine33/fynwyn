import { db } from '@/lib/db';
import { toNaira } from '@/lib/money';
import { Stat, dateTimeFmt, naira } from '@/components/ui';
import Link from 'next/link';
import { pageGuard } from './guard';

export default async function Overview({ searchParams }: { searchParams: { denied?: string } }) {
  const s = await pageGuard();
  const [customers, pendingPay, pendingOrders, ledger, products, recent] = await Promise.all([
    db.customer.count(),
    db.payment.aggregate({ where: { status: 'PENDING', method: 'BANK_TRANSFER' }, _count: true, _sum: { amount: true } }),
    db.order.count({ where: { status: 'PENDING_APPROVAL' } }),
    db.ledgerEntry.groupBy({ by: ['type'], _sum: { amount: true } }),
    db.product.findMany({ where: { active: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);
  const sum = (t: string) => ledger.find((l) => l.type === t)?._sum.amount ?? 0n;
  const contributed = sum('CONTRIBUTION') - sum('REVERSAL');
  const liability = sum('CONTRIBUTION') - sum('REVERSAL') + sum('ADJUSTMENT') - sum('SPEND'); // credit owed in drinks
  const low = products.filter((p) => p.onHand - p.reserved <= 10);
  return (
    <div>
      <h1 className="mb-1 text-3xl">Overview</h1>
      <p className="mb-5 text-muted">Welcome back, {s.name.split(' ')[0]}.</p>
      {searchParams.denied && <p className="notice notice-err mb-4">You don’t have access to that section.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Customers" value={customers} />
        <Stat label="Transfers to verify" value={pendingPay._count} hint={naira(toNaira(pendingPay._sum.amount ?? 0n))} />
        <Stat label="Orders awaiting approval" value={pendingOrders} />
        <Stat label="Outstanding drink credit" value={naira(toNaira(liability))} hint={`${naira(toNaira(contributed))} verified all-time`} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-xl">Needs attention</h2>
          <ul className="space-y-2 text-sm">
            <li><Link className="underline" href="/admin/payments">{pendingPay._count} transfer(s)</Link> waiting for verification</li>
            <li><Link className="underline" href="/admin/orders">{pendingOrders} order(s)</Link> waiting for approval</li>
            {low.length > 0 && <li><Link className="underline" href="/admin/inventory">{low.length} product(s)</Link> low on stock: {low.slice(0, 4).map((p) => p.name).join(', ')}</li>}
          </ul>
        </div>
        <div className="card">
          <h2 className="mb-2 text-xl">Recent activity</h2>
          <ul className="space-y-1.5 text-sm">
            {recent.length === 0 && <li className="text-muted">Nothing yet.</li>}
            {recent.map((a) => <li key={a.id}><span className="font-mono text-xs">{a.action}</span> <span className="text-muted">· {a.staffEmail ?? 'system'} · {dateTimeFmt(a.createdAt)}</span></li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
