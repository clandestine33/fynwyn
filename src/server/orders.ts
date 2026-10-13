import { db, type Tx } from '@/lib/db';
import { UserError } from '@/lib/errors';
import { orderSchema } from '@/lib/validators';
import { randomRef } from '@/lib/crypto';
import type { Customer, OrderStatus, StaffUser } from '@prisma/client';
import { getBalances, lockGoal } from './ledger';

const OPEN: OrderStatus[] = ['PENDING_APPROVAL', 'APPROVED', 'OUT_FOR_DELIVERY'];

function orderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `FDB-${ymd}-${randomRef(5)}`;
}

export async function createOrder(customer: Customer, input: unknown) {
  const d = orderSchema.parse(input);
  if (!customer.emailVerifiedAt) throw new UserError('Please verify your email address before redeeming.');
  const settings = await db.setting.findUnique({ where: { id: 1 } });
  if (settings && !settings.redemptionOpen) throw new UserError('Redemption is currently closed.');
  if (settings?.finalRedemptionDeadline && settings.finalRedemptionDeadline.getTime() < Date.now()) throw new UserError('The final redemption deadline has passed.');

  // merge duplicate lines
  const qty = new Map<string, number>();
  for (const i of d.items) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);
  const ids = [...qty.keys()].sort();

  return db.$transaction(async (tx) => {
    await lockGoal(tx, d.goalId); // lock order: goal first, then products (sorted) — avoids deadlocks
    const goal = await tx.goal.findFirst({ where: { id: d.goalId, customerId: customer.id } });
    if (!goal) throw new UserError('Plan not found.');
    if (!['ACTIVE', 'COMPLETED'].includes(goal.status)) throw new UserError('This plan is closed.');

    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
    const products = await tx.product.findMany({ where: { id: { in: ids } } });
    if (products.length !== ids.length) throw new UserError('One of the drinks is no longer available.');

    let total = 0n;
    for (const p of products) {
      const q = qty.get(p.id)!;
      if (!p.active) throw new UserError(`${p.name} is no longer available.`);
      if (p.onHand - p.reserved < q) throw new UserError(`Only ${Math.max(0, p.onHand - p.reserved)} of ${p.name} left in stock.`);
      total += p.unitPrice * BigInt(q);
    }
    const { available } = await getBalances(tx, goal.id);
    if (total > available) throw new UserError('Your available drink credit is not enough for this order.');

    const order = await tx.order.create({
      data: {
        number: orderNumber(), goalId: goal.id, customerId: customer.id, total,
        deliveryDate: d.deliveryDate, deliveryAddress: d.deliveryAddress, deliveryPhone: d.deliveryPhone, deliveryNote: d.deliveryNote,
        items: { create: products.map((p) => ({ productId: p.id, name: p.name, unitPrice: p.unitPrice, quantity: qty.get(p.id)! })) },
      },
    });
    await tx.ledgerEntry.create({ data: { goalId: goal.id, type: 'RESERVE', amount: total, orderId: order.id } });
    for (const p of products) {
      await tx.product.update({ where: { id: p.id }, data: { reserved: { increment: qty.get(p.id)! } } });
      await tx.stockMovement.create({ data: { productId: p.id, type: 'RESERVE', quantity: qty.get(p.id)!, reference: order.number } });
    }
    return order;
  });
}

async function loadOrderLocked(tx: Tx, orderId: string) {
  const o0 = await tx.order.findUnique({ where: { id: orderId } });
  if (!o0) throw new UserError('Order not found.');
  await lockGoal(tx, o0.goalId);
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const ids = order.items.map((i) => i.productId).sort();
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
  return order;
}

export async function setOrderStatus(orderId: string, to: 'APPROVED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED', staff: StaffUser | null, opts: { reason?: string; customerId?: string } = {}) {
  return db.$transaction(async (tx) => {
    const order = await loadOrderLocked(tx, orderId);
    if (opts.customerId && order.customerId !== opts.customerId) throw new UserError('Order not found.');
    const from = order.status;

    const allowed: Record<string, OrderStatus[]> = {
      APPROVED: ['PENDING_APPROVAL'],
      OUT_FOR_DELIVERY: ['APPROVED'],
      DELIVERED: ['APPROVED', 'OUT_FOR_DELIVERY'],
      CANCELLED: opts.customerId ? ['PENDING_APPROVAL'] : OPEN,
    };
    if (!allowed[to].includes(from)) throw new UserError(`An order that is ${from.replace(/_/g, ' ').toLowerCase()} cannot be moved to ${to.replace(/_/g, ' ').toLowerCase()}.`);

    if (to === 'DELIVERED') {
      await tx.ledgerEntry.create({ data: { goalId: order.goalId, type: 'SPEND', amount: order.total, orderId: order.id, createdBy: staff?.id } });
      for (const i of order.items) {
        await tx.product.update({ where: { id: i.productId }, data: { reserved: { decrement: i.quantity }, onHand: { decrement: i.quantity } } });
        await tx.stockMovement.create({ data: { productId: i.productId, type: 'DISPATCH', quantity: -i.quantity, reference: order.number, createdBy: staff?.id } });
      }
    }
    if (to === 'CANCELLED') {
      await tx.ledgerEntry.create({ data: { goalId: order.goalId, type: 'RELEASE', amount: order.total, orderId: order.id, createdBy: staff?.id } });
      for (const i of order.items) {
        await tx.product.update({ where: { id: i.productId }, data: { reserved: { decrement: i.quantity } } });
        await tx.stockMovement.create({ data: { productId: i.productId, type: 'RELEASE', quantity: i.quantity, reference: order.number, createdBy: staff?.id } });
      }
    }
    return tx.order.update({
      where: { id: orderId },
      data: {
        status: to,
        ...(to === 'APPROVED' ? { approvedBy: staff?.id, approvedAt: new Date() } : {}),
        ...(to === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        ...(to === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: opts.reason || (opts.customerId ? 'Cancelled by customer' : 'Cancelled by staff') } : {}),
      },
    });
  });
}
