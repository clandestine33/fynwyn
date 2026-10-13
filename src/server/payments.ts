import { db, type Tx } from '@/lib/db';
import { env } from '@/lib/env';
import { UserError } from '@/lib/errors';
import { safeEqual } from '@/lib/crypto';
import { toKobo } from '@/lib/money';
import { paystackSchema, transferSchema } from '@/lib/validators';
import { createHmac, randomUUID } from 'node:crypto';
import type { Customer, Payment, StaffUser } from '@prisma/client';
import { getBalances, lockGoal } from './ledger';
import { syncGoal } from './rewards';

const paystackBase = () => process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';

async function assertCanPay(customer: Customer, goalId: string) {
  if (!customer.emailVerifiedAt) throw new UserError('Please verify your email address before adding money.');
  const goal = await db.goal.findFirst({ where: { id: goalId, customerId: customer.id } });
  if (!goal) throw new UserError('Plan not found.');
  if (!['ACTIVE', 'COMPLETED'].includes(goal.status)) throw new UserError('This plan is closed.');
  return goal;
}

// ---------- manual bank transfer ----------
export async function submitTransfer(customer: Customer, input: unknown) {
  const d = transferSchema.parse(input);
  await assertCanPay(customer, d.goalId);
  const reference = d.reference.toUpperCase();
  const dup = await db.payment.findUnique({ where: { reference } });
  if (dup) throw new UserError('That payment reference has already been submitted.');
  const pending = await db.payment.count({ where: { customerId: customer.id, method: 'BANK_TRANSFER', status: 'PENDING' } });
  if (pending >= 5) throw new UserError('You have several transfers awaiting verification. Please wait for them to be reviewed.');
  return db.payment.create({
    data: { goalId: d.goalId, customerId: customer.id, method: 'BANK_TRANSFER', amount: toKobo(d.amount), reference, proofUrl: d.proofUrl },
  });
}

// ---------- Paystack ----------
export async function startPaystack(customer: Customer, input: unknown): Promise<string> {
  if (!env.paystackEnabled) throw new UserError('Online payment is not available right now. Please use bank transfer.');
  const d = paystackSchema.parse(input);
  await assertCanPay(customer, d.goalId);
  const reference = `FDB-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
  const payment = await db.payment.create({
    data: { goalId: d.goalId, customerId: customer.id, method: 'PAYSTACK', amount: toKobo(d.amount), reference },
  });
  const res = await fetch(`${paystackBase()}/transaction/initialize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.paystackSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: customer.email,
      amount: Number(payment.amount),
      currency: 'NGN',
      reference,
      callback_url: `${env.appUrl}/payments/callback`,
      metadata: { goalId: d.goalId, customerId: customer.id },
    }),
  });
  const json = (await res.json().catch(() => null)) as { status?: boolean; data?: { authorization_url?: string } } | null;
  if (!res.ok || !json?.status || !json.data?.authorization_url) {
    await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', gatewayData: json ?? {} } });
    throw new UserError('We could not start the payment. Please try again.');
  }
  return json.data.authorization_url;
}

export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !env.paystackSecret) return false;
  return safeEqual(createHmac('sha512', env.paystackSecret).update(rawBody).digest('hex'), signature);
}

/**
 * Idempotent: safe to call from the browser callback AND the webhook, any number of times.
 * We never trust the caller — the transaction is re-fetched from Paystack and the amount re-checked.
 */
export async function finalizePaystack(reference: string): Promise<Payment | null> {
  const payment = await db.payment.findUnique({ where: { reference } });
  if (!payment || payment.method !== 'PAYSTACK') return null;
  if (payment.status !== 'PENDING') return payment;

  const res = await fetch(`${paystackBase()}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${env.paystackSecret}` }, cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as { status?: boolean; data?: { status?: string; amount?: number; currency?: string } } | null;
  if (!res.ok || !json?.status || !json.data) return payment;

  const g = json.data;
  if (g.status === 'success') {
    if (g.currency !== 'NGN' || BigInt(g.amount ?? -1) !== payment.amount) {
      await db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', rejectReason: 'Amount/currency mismatch', gatewayData: json as object } });
      console.error('[paystack] amount mismatch', reference, g);
      return null;
    }
    return creditPayment(payment.id, null, json as object);
  }
  if (g.status === 'failed' || g.status === 'reversed') {
    return db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', gatewayData: json as object } });
  }
  return payment; // abandoned / ongoing — leave PENDING
}

// ---------- crediting (shared by Paystack + staff verification) ----------
async function creditPayment(paymentId: string, staff: Pick<StaffUser, 'id'> | null, gatewayData?: object): Promise<Payment> {
  return db.$transaction(async (tx) => {
    const p0 = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await lockGoal(tx, p0.goalId);
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (p.status === 'VERIFIED') return p;
    if (p.status !== 'PENDING') throw new UserError(`Payment is ${p.status.toLowerCase()} and cannot be verified.`);
    await tx.ledgerEntry.create({ data: { goalId: p.goalId, type: 'CONTRIBUTION', amount: p.amount, paymentId: p.id, createdBy: staff?.id } });
    const updated = await tx.payment.update({
      where: { id: p.id },
      data: { status: 'VERIFIED', verifiedBy: staff?.id, verifiedAt: new Date(), ...(gatewayData ? { gatewayData } : {}) },
    });
    await syncGoal(tx, p.goalId);
    return updated;
  });
}

// ---------- staff actions ----------
export async function verifyTransfer(paymentId: string, staff: StaffUser) {
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw new UserError('Payment not found.');
  if (p.method !== 'BANK_TRANSFER') throw new UserError('Online payments are verified automatically.');
  return creditPayment(paymentId, staff);
}

export async function rejectPayment(paymentId: string, reason: string) {
  const r = await db.payment.updateMany({ where: { id: paymentId, status: 'PENDING', method: 'BANK_TRANSFER' }, data: { status: 'REJECTED', rejectReason: reason || 'Could not be matched to a bank record' } });
  if (!r.count) throw new UserError('Only pending transfers can be rejected.');
}

export async function reversePayment(paymentId: string, staff: StaffUser, reason: string) {
  return db.$transaction(async (tx: Tx) => {
    const p0 = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await lockGoal(tx, p0.goalId);
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (p.status !== 'VERIFIED') throw new UserError('Only verified payments can be reversed.');
    const { available } = await getBalances(tx, p.goalId);
    if (available < p.amount) throw new UserError('The customer has already reserved or spent this credit. Cancel their open orders first.');
    await tx.ledgerEntry.create({ data: { goalId: p.goalId, type: 'REVERSAL', amount: p.amount, paymentId: p.id, createdBy: staff.id, note: reason } });
    await tx.payment.update({ where: { id: p.id }, data: { status: 'REVERSED', rejectReason: reason } });
    await syncGoal(tx, p.goalId);
  });
}

export async function adjustCredit(goalId: string, staff: StaffUser, amountNaira: number, note: string) {
  if (!note.trim()) throw new UserError('A reason is required for manual adjustments.');
  return db.$transaction(async (tx) => {
    await lockGoal(tx, goalId);
    const delta = toKobo(amountNaira);
    const { available } = await getBalances(tx, goalId);
    if (available + delta < 0n) throw new UserError('Adjustment would make the balance negative.');
    await tx.ledgerEntry.create({ data: { goalId, type: 'ADJUSTMENT', amount: delta, createdBy: staff.id, note } });
    await syncGoal(tx, goalId);
  });
}
