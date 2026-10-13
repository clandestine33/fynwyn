import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { createGoal, upgradeGoal, cancelGoal } from '@/server/goals';
import { getBalances } from '@/server/ledger';
import { createOrder, setOrderStatus } from '@/server/orders';
import { adjustCredit, rejectPayment, reversePayment, submitTransfer, verifyPaystackSignature, verifyTransfer } from '@/server/payments';
import { login, register, requestReset, resetPassword, verifyEmail } from '@/server/auth';
import { sha256 } from '@/lib/crypto';
import type { Customer, Package, Product, StaffUser } from '@prisma/client';

const tag = `t${Date.now()}`;
const k = (n: number) => BigInt(n * 100);
const future = new Date(Date.now() + 90 * 86_400_000);

let customer: Customer, staff: StaffUser, small: Package, big: Package, wine: Product;

async function fundedGoal(naira: number) {
  await db.goal.updateMany({ where: { customerId: customer.id }, data: { status: 'CLOSED' } }); // stay under the per-customer plan cap
  const goal = await createGoal(customer.id, { title: `g-${tag}`, occasion: 'BIRTHDAY', eventDate: future, packageId: small.id });
  const pay = await submitTransfer(customer, { goalId: goal.id, amount: naira, reference: `REF-${tag}-${Math.random().toString(36).slice(2)}` });
  await verifyTransfer(pay.id, staff);
  return { goal, pay };
}
const order = (goalId: string, qty: number, who = customer) =>
  createOrder(who, { goalId, items: [{ productId: wine.id, quantity: qty }], deliveryAddress: '12 Test Street, Lagos', deliveryPhone: '08012345678' });

beforeAll(async () => {
  customer = await db.customer.create({ data: { email: `${tag}@test.local`, name: 'Test Customer', passwordHash: 'x', emailVerifiedAt: new Date() } });
  staff = await db.staffUser.create({ data: { email: `${tag}-staff@test.local`, name: 'Tester', role: 'FINANCE', passwordHash: 'x' } });
  small = await db.package.create({ data: { slug: `s-${tag}`, name: 'S', targetAmount: k(100_000), benefits: { create: [{ title: 'Included perk', milestoneAmount: 0n }, { title: 'Half-way perk', milestoneAmount: k(50_000) }] } } });
  big = await db.package.create({ data: { slug: `b-${tag}`, name: 'B', targetAmount: k(500_000), benefits: { create: [{ title: 'Big perk', milestoneAmount: k(60_000) }] } } });
  wine = await db.product.create({ data: { name: `Wine ${tag}`, unitPrice: k(10_000), onHand: 10 } });
});

afterAll(async () => {
  const goals = await db.goal.findMany({ where: { customerId: customer.id }, select: { id: true } });
  const ids = goals.map((g) => g.id);
  await db.rewardEntitlement.deleteMany({ where: { goalId: { in: ids } } });
  await db.ledgerEntry.deleteMany({ where: { goalId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { order: { customerId: customer.id } } });
  await db.order.deleteMany({ where: { customerId: customer.id } });
  await db.payment.deleteMany({ where: { customerId: customer.id } });
  await db.goal.deleteMany({ where: { customerId: customer.id } });
  await db.stockMovement.deleteMany({ where: { productId: wine.id } });
  await db.product.delete({ where: { id: wine.id } });
  await db.package.deleteMany({ where: { id: { in: [small.id, big.id] } } });
  await db.authToken.deleteMany({ where: { customer: { email: { startsWith: tag } } } });
  await db.customer.deleteMany({ where: { email: { startsWith: tag } } });
  await db.staffUser.delete({ where: { id: staff.id } });
  await db.$disconnect();
});

describe('payments & ledger', () => {
  it('credits only after verification, and exactly once', async () => {
    const goal = await createGoal(customer.id, { title: 'Test plan', occasion: 'WEDDING', eventDate: future, packageId: small.id });
    const pay = await submitTransfer(customer, { goalId: goal.id, amount: 20_000, reference: `once-${tag}` });
    expect((await getBalances(db, goal.id)).available).toBe(0n);
    await Promise.all([verifyTransfer(pay.id, staff), verifyTransfer(pay.id, staff)].map((p) => p.catch(() => null)));
    await verifyTransfer(pay.id, staff); // idempotent
    expect((await getBalances(db, goal.id)).available).toBe(k(20_000));
    expect(await db.ledgerEntry.count({ where: { paymentId: pay.id } })).toBe(1);
  });

  it('rejects duplicate references and rejected payments never credit', async () => {
    const goal = await createGoal(customer.id, { title: 'Test plan', occasion: 'WEDDING', eventDate: future, packageId: small.id });
    const p = await submitTransfer(customer, { goalId: goal.id, amount: 5_000, reference: `dup-${tag}` });
    await expect(submitTransfer(customer, { goalId: goal.id, amount: 5_000, reference: `DUP-${tag}` })).rejects.toThrow(/already been submitted/);
    await rejectPayment(p.id, 'not found');
    await expect(verifyTransfer(p.id, staff)).rejects.toThrow(/rejected/);
    expect((await getBalances(db, goal.id)).available).toBe(0n);
  });

  it('refuses to reverse credit that has been reserved', async () => {
    const { goal, pay } = await fundedGoal(30_000);
    await order(goal.id, 2);
    await expect(reversePayment(pay.id, staff, 'chargeback')).rejects.toThrow(/reserved or spent/);
  });

  it('reverses unspent credit and re-derives rewards', async () => {
    const { goal, pay } = await fundedGoal(60_000);
    expect((await db.rewardEntitlement.findMany({ where: { goalId: goal.id, status: 'ELIGIBLE' } })).map((e) => e.titleSnapshot).sort()).toEqual(['Half-way perk', 'Included perk']);
    await reversePayment(pay.id, staff, 'duplicate');
    const after = await db.rewardEntitlement.findMany({ where: { goalId: goal.id } });
    expect(after.find((e) => e.titleSnapshot === 'Half-way perk')?.status).toBe('CANCELLED');
    expect(after.find((e) => e.titleSnapshot === 'Included perk')?.status).toBe('ELIGIBLE');
    expect((await getBalances(db, goal.id)).available).toBe(0n);
  });

  it('adjustments need a reason and cannot overdraw', async () => {
    const { goal } = await fundedGoal(1_000);
    await expect(adjustCredit(goal.id, staff, -5_000, 'oops')).rejects.toThrow(/negative/);
    await expect(adjustCredit(goal.id, staff, 100, ' ')).rejects.toThrow(/reason/);
    await adjustCredit(goal.id, staff, 500, 'goodwill');
    expect((await getBalances(db, goal.id)).available).toBe(k(1_500));
  });

  it('upgrade-only, and unlocks the new package perks', async () => {
    const { goal } = await fundedGoal(70_000);
    await expect(upgradeGoal(customer.id, goal.id, small.id)).rejects.toThrow(/upgrades/);
    await upgradeGoal(customer.id, goal.id, big.id);
    expect((await db.rewardEntitlement.findMany({ where: { goalId: goal.id } })).map((e) => e.titleSnapshot)).toContain('Big perk');
  });
});

describe('orders', () => {
  it('reserves credit + stock, then spends on delivery', async () => {
    const { goal } = await fundedGoal(50_000);
    const before = await db.product.findUniqueOrThrow({ where: { id: wine.id } });
    const o = await order(goal.id, 3);
    let b = await getBalances(db, goal.id);
    expect([b.available, b.reserved]).toEqual([k(20_000), k(30_000)]);
    expect((await db.product.findUniqueOrThrow({ where: { id: wine.id } })).reserved).toBe(before.reserved + 3);
    await setOrderStatus(o.id, 'APPROVED', staff);
    await setOrderStatus(o.id, 'DELIVERED', staff);
    b = await getBalances(db, goal.id);
    expect([b.available, b.reserved, b.spent]).toEqual([k(20_000), 0n, k(30_000)]);
    const after = await db.product.findUniqueOrThrow({ where: { id: wine.id } });
    expect([after.onHand, after.reserved]).toEqual([before.onHand - 3, before.reserved]);
    await expect(setOrderStatus(o.id, 'CANCELLED', staff)).rejects.toThrow();
  });

  it('cancel releases credit and stock; customers can only cancel pending orders', async () => {
    const { goal } = await fundedGoal(20_000);
    const o = await order(goal.id, 2);
    await setOrderStatus(o.id, 'APPROVED', staff);
    await expect(setOrderStatus(o.id, 'CANCELLED', null, { customerId: customer.id })).rejects.toThrow();
    await setOrderStatus(o.id, 'CANCELLED', staff, { reason: 'out of ice' });
    const b = await getBalances(db, goal.id);
    expect([b.available, b.reserved]).toEqual([k(20_000), 0n]);
  });

  it('CONCURRENCY: two simultaneous orders cannot spend the same credit', async () => {
    const { goal } = await fundedGoal(60_000);
    const results = await Promise.allSettled([order(goal.id, 4), order(goal.id, 4), order(goal.id, 4)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const b = await getBalances(db, goal.id);
    expect(b.available).toBe(k(20_000)); expect(b.reserved).toBe(k(40_000));
    for (const r of results) if (r.status === 'fulfilled') await setOrderStatus(r.value.id, 'CANCELLED', staff);
  });

  it('CONCURRENCY: stock is never oversold across customers', async () => {
    const other = await db.customer.create({ data: { email: `${tag}-b@test.local`, name: 'B', passwordHash: 'x', emailVerifiedAt: new Date() } });
    const a = await fundedGoal(200_000);
    const gB = await createGoal(other.id, { title: 'Plan B', occasion: 'OTHER', eventDate: future, packageId: small.id });
    const pB = await submitTransfer(other, { goalId: gB.id, amount: 200_000, reference: `b-${tag}` });
    await verifyTransfer(pB.id, staff);
    const cur = await db.product.findUniqueOrThrow({ where: { id: wine.id } });
    const free = cur.onHand - cur.reserved;
    const res = await Promise.allSettled([order(a.goal.id, free), order(gB.id, free)]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const end = await db.product.findUniqueOrThrow({ where: { id: wine.id } });
    expect(end.onHand - end.reserved).toBe(0);
    for (const r of res) if (r.status === 'fulfilled') await setOrderStatus(r.value.id, 'CANCELLED', staff);
    await db.goal.deleteMany({ where: { id: gB.id } }).catch(() => null); // cleaned via customer cascade-less delete below
    await db.ledgerEntry.deleteMany({ where: { goalId: gB.id } });
    await db.orderItem.deleteMany({ where: { order: { customerId: other.id } } });
    await db.order.deleteMany({ where: { customerId: other.id } });
    await db.payment.deleteMany({ where: { customerId: other.id } });
    await db.rewardEntitlement.deleteMany({ where: { goalId: gB.id } });
    await db.goal.deleteMany({ where: { id: gB.id } });
  });

  it("rejects orders over available credit, out-of-stock, and other customers' plans", async () => {
    const { goal } = await fundedGoal(10_000);
    await expect(order(goal.id, 2)).rejects.toThrow(/not enough/);
    const rich = await fundedGoal(500_000);
    await expect(order(rich.goal.id, 999)).rejects.toThrow(/left in stock/);
    const stranger = await db.customer.create({ data: { email: `${tag}-c@test.local`, name: 'C', passwordHash: 'x', emailVerifiedAt: new Date() } });
    await expect(order(goal.id, 1, stranger)).rejects.toThrow(/not found/i);
  });

  it('only allows closing a plan once credit is used', async () => {
    const { goal } = await fundedGoal(5_000);
    await expect(cancelGoal(customer.id, goal.id)).rejects.toThrow(/still has drink credit/);
  });
});

describe('auth', () => {
  const email = `${tag}-auth@test.local`;
  it('register -> verify email (single use) -> login -> lockout -> reset', async () => {
    const c = await register({ name: 'Auth User', email, password: 'Correct-Horse-9', acceptTerms: true });
    expect(c.emailVerifiedAt).toBeNull();
    const t = await db.authToken.findFirstOrThrow({ where: { customerId: c.id, type: 'EMAIL_VERIFY' } });
    expect(t.tokenHash).toHaveLength(64); // only a hash is stored
    await expect(verifyEmail('not-a-real-token-not-a-real-token')).rejects.toThrow(/invalid/);
    // token can't be recovered from DB; issue a fresh known one instead
    const raw = 'a'.repeat(64);
    await db.authToken.create({ data: { customerId: c.id, type: 'EMAIL_VERIFY', tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 60_000) } });
    await verifyEmail(raw);
    await expect(verifyEmail(raw)).rejects.toThrow(/invalid|used/);
    expect((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).emailVerifiedAt).not.toBeNull();

    await expect(register({ name: 'Dup', email: email.toUpperCase(), password: 'Correct-Horse-9', acceptTerms: true })).rejects.toThrow(/already exists/);
    await expect(login({ email, password: 'wrong' })).rejects.toThrow(/Incorrect/);
    expect((await login({ email, password: 'Correct-Horse-9' })).id).toBe(c.id);

    for (let i = 0; i < 5; i++) await login({ email, password: 'bad' }).catch(() => null);
    await expect(login({ email, password: 'Correct-Horse-9' })).rejects.toThrow(/Too many/);

    await requestReset(email); // never throws / leaks
    await requestReset(`nobody-${tag}@test.local`);
    const rr = 'b'.repeat(64);
    await db.authToken.create({ data: { customerId: c.id, type: 'PASSWORD_RESET', tokenHash: sha256(rr), expiresAt: new Date(Date.now() + 60_000) } });
    await expect(resetPassword({ token: rr, password: 'short' })).rejects.toBeTruthy();
    await resetPassword({ token: rr, password: 'Brand-New-Pass-42' });
    expect((await login({ email, password: 'Brand-New-Pass-42' })).id).toBe(c.id);
    await expect(resetPassword({ token: rr, password: 'Another-Pass-4242' })).rejects.toThrow();
  });
});

describe('paystack signature', () => {
  it('accepts only a correct HMAC-SHA512 of the raw body', () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_unit';
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'R1' } });
    const good = createHmac('sha512', 'sk_test_unit').update(body).digest('hex');
    expect(verifyPaystackSignature(body, good)).toBe(true);
    expect(verifyPaystackSignature(body + ' ', good)).toBe(false);
    expect(verifyPaystackSignature(body, null)).toBe(false);
    expect(verifyPaystackSignature(body, 'deadbeef')).toBe(false);
    delete process.env.PAYSTACK_SECRET_KEY;
  });
});
