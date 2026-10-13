/** npm run db:demo — creates a demo customer with a funded plan, a pending transfer and an order. DEV ONLY. */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createGoal } from '../src/server/goals';
import { submitTransfer, verifyTransfer } from '../src/server/payments';
import { createOrder } from '../src/server/orders';

if (process.env.NODE_ENV === 'production') { console.error('Refusing to create demo data in production.'); process.exit(1); }
const db = new PrismaClient();

async function main() {
  const email = 'demo@fynwyn.local';
  const customer = (await db.customer.findUnique({ where: { email } })) ??
    (await db.customer.create({ data: { email, name: 'Demo Customer', phone: '08012345678', passwordHash: await bcrypt.hash('Demo-Password-1', 12), emailVerifiedAt: new Date() } }));
  if (await db.goal.count({ where: { customerId: customer.id } })) return console.log('Demo data already exists.');

  const staff = await db.staffUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  const toast = await db.package.findUniqueOrThrow({ where: { slug: 'toast' } });
  const celebrate = await db.package.findUniqueOrThrow({ where: { slug: 'celebrate' } });
  const eventDate = new Date(Date.now() + 120 * 86_400_000);

  const g1 = await createGoal(customer.id, { title: 'Ada’s 40th birthday', occasion: 'BIRTHDAY', eventDate, guestCount: 80, packageId: toast.id });
  const p1 = await submitTransfer(customer, { goalId: g1.id, amount: 300000, reference: 'DEMO-TRF-0001' });
  await verifyTransfer(p1.id, staff);
  const hen = await db.product.findFirstOrThrow({ where: { sku: 'FDB-COG-001' } });
  await createOrder(customer, { goalId: g1.id, items: [{ productId: hen.id, quantity: 2 }], deliveryAddress: '14 Admiralty Way, Lekki, Lagos', deliveryPhone: '08012345678' });
  await submitTransfer(customer, { goalId: g1.id, amount: 50000, reference: 'DEMO-TRF-0002' }); // left pending for staff to verify

  await createGoal(customer.id, { title: 'Tolu & Bisi’s wedding', occasion: 'WEDDING', eventDate: new Date(Date.now() + 300 * 86_400_000), guestCount: 250, packageId: celebrate.id });
  console.log('Demo ready → customer demo@fynwyn.local / Demo-Password-1');
}
main().finally(() => db.$disconnect());
