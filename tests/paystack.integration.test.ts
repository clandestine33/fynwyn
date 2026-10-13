import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { db } from '@/lib/db';
import { createGoal } from '@/server/goals';
import { getBalances } from '@/server/ledger';
import { finalizePaystack, startPaystack } from '@/server/payments';
import type { Customer, Package } from '@prisma/client';

const tag = `ps${Date.now()}`;
const future = new Date(Date.now() + 60 * 86_400_000);
let server: http.Server, customer: Customer, pkg: Package;
// reference -> what the mock Paystack will report
const gateway = new Map<string, { status: string; amount: number; currency: string }>();
let verifyCalls = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url?.startsWith('/transaction/initialize')) {
      let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
        const { reference, amount } = JSON.parse(b);
        gateway.set(reference, { status: 'success', amount, currency: 'NGN' });
        res.end(JSON.stringify({ status: true, data: { authorization_url: `https://checkout.paystack.test/${reference}` } }));
      });
    } else if (req.url?.startsWith('/transaction/verify/')) {
      verifyCalls++;
      const g = gateway.get(decodeURIComponent(req.url.split('/').pop()!));
      res.end(JSON.stringify(g ? { status: true, data: g } : { status: false }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.PAYSTACK_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_mock';
  customer = await db.customer.create({ data: { email: `${tag}@test.local`, name: 'PS', passwordHash: 'x', emailVerifiedAt: new Date() } });
  pkg = await db.package.create({ data: { slug: tag, name: 'P', targetAmount: 100_000_00n } });
});
afterAll(async () => {
  server.close();
  const goals = (await db.goal.findMany({ where: { customerId: customer.id }, select: { id: true } })).map((g) => g.id);
  await db.ledgerEntry.deleteMany({ where: { goalId: { in: goals } } });
  await db.payment.deleteMany({ where: { customerId: customer.id } });
  await db.goal.deleteMany({ where: { customerId: customer.id } });
  await db.package.delete({ where: { id: pkg.id } });
  await db.customer.delete({ where: { id: customer.id } });
  delete process.env.PAYSTACK_BASE_URL; delete process.env.PAYSTACK_SECRET_KEY;
  await db.$disconnect();
});

const ref = (url: string) => url.split('/').pop()!;

describe('paystack', () => {
  it('credits once, even when callback and webhook race', async () => {
    const goal = await createGoal(customer.id, { title: 'PS plan', occasion: 'OTHER', eventDate: future, packageId: pkg.id });
    const url = await startPaystack(customer, { goalId: goal.id, amount: 25_000 });
    const r = ref(url);
    expect((await db.payment.findUniqueOrThrow({ where: { reference: r } })).status).toBe('PENDING');
    expect((await getBalances(db, goal.id)).available).toBe(0n); // redirect alone gives no credit
    await Promise.all([finalizePaystack(r), finalizePaystack(r), finalizePaystack(r)]);
    await finalizePaystack(r);
    expect((await getBalances(db, goal.id)).available).toBe(25_000_00n);
    expect(await db.ledgerEntry.count({ where: { paymentId: (await db.payment.findUniqueOrThrow({ where: { reference: r } })).id } })).toBe(1);
    const calls = verifyCalls; await finalizePaystack(r); expect(verifyCalls).toBe(calls); // settled payments don't hit the gateway again
  });

  it('refuses to credit when the gateway amount differs from what we charged', async () => {
    const goal = await createGoal(customer.id, { title: 'PS plan 2', occasion: 'OTHER', eventDate: future, packageId: pkg.id });
    const r = ref(await startPaystack(customer, { goalId: goal.id, amount: 50_000 }));
    gateway.set(r, { status: 'success', amount: 100, currency: 'NGN' }); // paid ₦1 instead of ₦50,000
    await finalizePaystack(r);
    expect((await db.payment.findUniqueOrThrow({ where: { reference: r } })).status).toBe('FAILED');
    expect((await getBalances(db, goal.id)).available).toBe(0n);
  });

  it('refuses the wrong currency, ignores abandoned, marks failed', async () => {
    const goal = await createGoal(customer.id, { title: 'PS plan 3', occasion: 'OTHER', eventDate: future, packageId: pkg.id });
    const a = ref(await startPaystack(customer, { goalId: goal.id, amount: 10_000 }));
    gateway.set(a, { status: 'success', amount: 10_000_00, currency: 'USD' }); await finalizePaystack(a);
    expect((await db.payment.findUniqueOrThrow({ where: { reference: a } })).status).toBe('FAILED');
    const b = ref(await startPaystack(customer, { goalId: goal.id, amount: 10_000 }));
    gateway.set(b, { status: 'abandoned', amount: 10_000_00, currency: 'NGN' }); await finalizePaystack(b);
    expect((await db.payment.findUniqueOrThrow({ where: { reference: b } })).status).toBe('PENDING');
    gateway.set(b, { status: 'failed', amount: 10_000_00, currency: 'NGN' }); await finalizePaystack(b);
    expect((await db.payment.findUniqueOrThrow({ where: { reference: b } })).status).toBe('FAILED');
    expect((await getBalances(db, goal.id)).available).toBe(0n);
    expect(await finalizePaystack('does-not-exist')).toBeNull();
  });

  it('requires a verified email and own plan', async () => {
    const stranger = await db.customer.create({ data: { email: `${tag}-x@test.local`, name: 'X', passwordHash: 'x' } });
    const goal = await createGoal(customer.id, { title: 'PS plan 4', occasion: 'OTHER', eventDate: future, packageId: pkg.id });
    await expect(startPaystack(stranger, { goalId: goal.id, amount: 1000 })).rejects.toThrow(/verify your email/);
    await db.customer.update({ where: { id: stranger.id }, data: { emailVerifiedAt: new Date() } });
    await expect(startPaystack({ ...stranger, emailVerifiedAt: new Date() }, { goalId: goal.id, amount: 1000 })).rejects.toThrow(/not found/i);
    await db.customer.delete({ where: { id: stranger.id } });
  });
});
