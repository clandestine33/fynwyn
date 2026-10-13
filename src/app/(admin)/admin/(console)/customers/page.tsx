import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Badge, Table, dateFmt } from '@/components/ui';
import { pageGuard } from '../guard';
import { Pager } from '@/components/Pager';

export const metadata: Metadata = { title: 'Customers' };

export default async function Customers({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  await pageGuard();
  const q = (searchParams.q ?? '').trim();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const where = q ? { OR: [{ email: { contains: q, mode: 'insensitive' as const } }, { name: { contains: q, mode: 'insensitive' as const } }, { phone: { contains: q } }] } : {};
  const [rows, total] = await Promise.all([
    db.customer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { _count: { select: { goals: true } } } }),
    db.customer.count({ where }),
  ]);
  return (
    <div>
      <h1 className="mb-4 text-3xl">Customers</h1>
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search name, email or phone" className="input max-w-sm" /><button className="btn btn-secondary">Search</button></form>
      <Table head={['Name', 'Email', 'Plans', 'Joined', 'Status']} empty="No customers found.">
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="td"><Link href={`/admin/customers/${c.id}`} className="font-semibold underline">{c.name}</Link></td>
            <td className="td">{c.email} {!c.emailVerifiedAt && <span className="text-xs text-muted">(unverified)</span>}</td>
            <td className="td">{c._count.goals}</td><td className="td">{dateFmt(c.createdAt)}</td><td className="td"><Badge status={c.status} /></td>
          </tr>
        ))}
      </Table>
      <Pager base={`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`} page={page} total={total} />
    </div>
  );
}
