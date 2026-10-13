'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { safe, UserError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp, requireCustomer } from '@/lib/session';
import { cancelGoal, createGoal, updateGoalDetails, upgradeGoal } from '@/server/goals';
import { goalSchema } from '@/lib/validators';
import { createOrder, setOrderStatus } from '@/server/orders';
import { startPaystack, submitTransfer } from '@/server/payments';

const str = (f: FormData, k: string) => String(f.get(k) ?? '');
function limit(key: string, max: number, windowMs: number, who: string) {
  if (!rateLimit(`${key}:${who}:${clientIp()}`, max, windowMs).ok) throw new UserError('You are doing that too often. Please wait a moment.');
}

export async function createGoalAction(_: unknown, f: FormData) {
  return safe(async () => {
    const c = await requireCustomer();
    const g = await createGoal(c.id, {
      title: str(f, 'title'), occasion: str(f, 'occasion'), eventDate: str(f, 'eventDate'), guestCount: str(f, 'guestCount'),
      notes: str(f, 'notes') || undefined, packageId: str(f, 'packageId'),
    });
    redirect(`/goals/${g.id}?created=1`);
  });
}

export async function upgradeGoalAction(_: unknown, f: FormData) {
  return safe(async () => {
    const c = await requireCustomer();
    const p = await upgradeGoal(c.id, str(f, 'goalId'), str(f, 'packageId'));
    revalidatePath(`/goals/${str(f, 'goalId')}`);
    return { ok: true as const, message: `Upgraded to ${p.name}.` };
  });
}

export async function closeGoalAction(_: unknown, f: FormData) {
  return safe(async () => {
    const c = await requireCustomer();
    await cancelGoal(c.id, str(f, 'goalId'));
    redirect('/dashboard');
  });
}

export async function paystackAction(_: unknown, f: FormData) {
  return safe(async () => {
    const c = await requireCustomer();
    limit('pay', 10, 3_600_000, c.id);
    const url = await startPaystack(c, { goalId: str(f, 'goalId'), amount: str(f, 'amount') });
    return { ok: true as const, data: { url } };
  });
}

export async function transferAction(_: unknown, f: FormData) {
  return safe(async () => {
    const c = await requireCustomer();
    limit('transfer', 10, 3_600_000, c.id);
    await submitTransfer(c, { goalId: str(f, 'goalId'), amount: str(f, 'amount'), reference: str(f, 'reference'), proofUrl: str(f, 'proofUrl') });
    revalidatePath(`/goals/${str(f, 'goalId')}`);
    return { ok: true as const, message: 'Submitted. Your credit is added once our team verifies the transfer (usually within one business day).' };
  });
}

export async function orderAction(_: unknown, f: FormData) {
  return safe(async () => {
    const c = await requireCustomer();
    limit('order', 10, 3_600_000, c.id);
    let items: unknown;
    try { items = JSON.parse(str(f, 'items')); } catch { throw new UserError('Invalid basket.'); }
    const o = await createOrder(c, {
      goalId: str(f, 'goalId'), items, deliveryDate: str(f, 'deliveryDate'), deliveryAddress: str(f, 'deliveryAddress'),
      deliveryPhone: str(f, 'deliveryPhone'), deliveryNote: str(f, 'deliveryNote') || undefined,
    });
    revalidatePath(`/goals/${str(f, 'goalId')}`);
    return { ok: true as const, message: `Order ${o.number} placed. Credit and stock are reserved while we approve it.` };
  });
}

export async function cancelOrderAction(_: unknown, f: FormData) {
  return safe(async () => {
    const c = await requireCustomer();
    await setOrderStatus(str(f, 'orderId'), 'CANCELLED', null, { customerId: c.id });
    revalidatePath('/goals/[id]', 'page');
    return { ok: true as const, message: 'Order cancelled and credit released.' };
  });
}

export async function updateGoalAction(_: unknown, f: FormData) {
  return safe(async () => {
    const c = await requireCustomer();
    const d = goalSchema.pick({ title: true, eventDate: true, guestCount: true }).parse({ title: str(f, 'title'), eventDate: str(f, 'eventDate'), guestCount: str(f, 'guestCount') });
    await updateGoalDetails(c.id, str(f, 'goalId'), d);
    revalidatePath(`/goals/${str(f, 'goalId')}`);
    return { ok: true as const, message: 'Plan updated.' };
  });
}
