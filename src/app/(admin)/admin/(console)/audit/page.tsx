import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { Table, dateTimeFmt } from '@/components/ui';
import { Pager } from '@/components/Pager';
import { pageGuard } from '../guard';

export const metadata: Metadata = { title: 'Audit log' };

export default async function Audit({ searchParams }: { searchParams: { page?: string } }) {
  await pageGuard();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const [rows, total] = await Promise.all([db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25 }), db.auditLog.count()]);
  return (
    <div>
      <h1 className="mb-4 text-3xl">Audit log</h1>
      <Table head={['When', 'Staff', 'Action', 'Entity', 'Details', 'IP']} empty="No activity recorded.">
        {rows.map((a) => (
          <tr key={a.id}><td className="td whitespace-nowrap">{dateTimeFmt(a.createdAt)}</td><td className="td">{a.staffEmail ?? 'system'}</td><td className="td font-mono text-xs">{a.action}</td><td className="td text-xs">{a.entity}{a.entityId ? ` · ${a.entityId.slice(0, 10)}…` : ''}</td><td className="td font-mono text-[11px]">{a.meta ? JSON.stringify(a.meta) : ''}</td><td className="td text-xs">{a.ip ?? '—'}</td></tr>
        ))}
      </Table>
      <Pager base="/admin/audit" page={page} total={total} />
    </div>
  );
}
