import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { finalizePaystack } from '@/server/payments';
import { triggerSheetSync } from '@/server/sheet-sync';

export const dynamic = 'force-dynamic';

export default async function Callback({ searchParams }: { searchParams: { reference?: string; trxref?: string } }) {
  const ref = searchParams.reference || searchParams.trxref;
  if (!ref) redirect('/dashboard');
  const payment = await finalizePaystack(ref).catch(() => null) ?? (await db.payment.findUnique({ where: { reference: ref } }));
  if (!payment) redirect('/dashboard');
  triggerSheetSync();
  redirect(`/goals/${payment.goalId}?pay=${payment.status.toLowerCase()}`);
}
