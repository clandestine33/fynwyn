'use server';
/**
 * Every export here is a publicly addressable endpoint (Next server actions), so EVERY one re-checks
 * the staff session, role and deployment context itself. Never rely on middleware alone.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { fail, safe, UserError } from '@/lib/errors';
import { toKobo } from '@/lib/money';
import { rateLimit } from '@/lib/rate-limit';
import { assertAdminContext, clientIp, createStaffSession, destroyStaffSession, requireStaff } from '@/lib/session';
import { audit } from '@/server/audit';
import { hashPassword, staffLogin } from '@/server/auth';
import { setOrderStatus } from '@/server/orders';
import { adjustCredit, rejectPayment, reversePayment, verifyTransfer } from '@/server/payments';
import { syncGoal } from '@/server/rewards';
import { lockGoal } from '@/server/ledger';
import { password } from '@/lib/validators';
import { acceptImageUrl, cloudinaryEnabled, destroyImage, uploadTicket } from '@/lib/cloudinary';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const bool = (f: FormData, k: string) => str(f, k) === 'true';
const done = (path: string, message: string) => { revalidatePath(path); return { ok: true as const, message }; };

// ---------- session ----------
export async function staffLoginAction(_: unknown, f: FormData) {
  return safe(async () => {
    assertAdminContext();
    const r = rateLimit(`staff-login:${clientIp()}`, 10, 15 * 60_000);
    if (!r.ok) throw new UserError('Too many attempts. Try again later.');
    const s = await staffLogin(str(f, 'email'), String(f.get('password') ?? ''));
    await createStaffSession(s.id, s.sessionVersion);
    await audit(s, 'staff.login');
    redirect('/admin');
  });
}

export async function staffLogoutAction() {
  destroyStaffSession();
  redirect('/admin/login');
}

// ---------- payments (FINANCE) ----------
export async function verifyPaymentAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff('FINANCE');
    const p = await verifyTransfer(str(f, 'id'), s);
    await audit(s, 'payment.verify', 'Payment', p.id, { amount: String(p.amount), reference: p.reference });
    return done('/admin/payments', 'Payment verified and credit added.');
  });
}
export async function rejectPaymentAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff('FINANCE');
    await rejectPayment(str(f, 'id'), str(f, 'reason'));
    await audit(s, 'payment.reject', 'Payment', str(f, 'id'), { reason: str(f, 'reason') });
    return done('/admin/payments', 'Payment rejected.');
  });
}
export async function reversePaymentAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff('FINANCE');
    if (!str(f, 'reason')) return fail('A reason is required to reverse a payment.');
    await reversePayment(str(f, 'id'), s, str(f, 'reason'));
    await audit(s, 'payment.reverse', 'Payment', str(f, 'id'), { reason: str(f, 'reason') });
    return done('/admin/payments', 'Credit reversed. Process any cash refund separately.');
  });
}
export async function adjustCreditAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff('FINANCE');
    const amount = z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, 'Enter a non-zero amount').parse(f.get('amount'));
    await adjustCredit(str(f, 'goalId'), s, amount, str(f, 'note'));
    await audit(s, 'credit.adjust', 'Goal', str(f, 'goalId'), { amount, note: str(f, 'note') });
    return done('/admin/customers', 'Credit adjusted.');
  });
}

// ---------- orders (OPERATIONS) ----------
export async function orderStatusAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff('OPERATIONS');
    const to = z.enum(['APPROVED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']).parse(str(f, 'to'));
    const o = await setOrderStatus(str(f, 'id'), to, s, { reason: str(f, 'reason') });
    await audit(s, `order.${to.toLowerCase()}`, 'Order', o.id, { number: o.number });
    return done('/admin/orders', `Order ${o.number} marked ${to.replace(/_/g, ' ').toLowerCase()}.`);
  });
}

// ---------- inventory & catalogue (OPERATIONS) ----------
const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  sku: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).optional().or(z.literal('')),
  unitPrice: z.coerce.number().min(0).max(100_000_000),
  unitCost: z.coerce.number().min(0).max(100_000_000).default(0),
  active: z.boolean(),
});
export async function saveProductAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff('OPERATIONS');
    const d = productSchema.parse({ id: str(f, 'id') || undefined, name: str(f, 'name'), category: str(f, 'category'), sku: str(f, 'sku') || undefined, description: str(f, 'description') || undefined, imageUrl: str(f, 'imageUrl'), unitPrice: str(f, 'unitPrice'), unitCost: str(f, 'unitCost') || 0, active: bool(f, 'active') });
    // Images must be ones we uploaded to our own Cloudinary account/folder (or the unchanged existing value).
    const existing = d.id ? await db.product.findUnique({ where: { id: d.id }, select: { imageUrl: true, imagePublicId: true } }) : null;
    let image: { url: string; publicId: string | null } | null = null;
    if (d.imageUrl) {
      image = d.imageUrl === existing?.imageUrl ? { url: d.imageUrl, publicId: existing.imagePublicId } : acceptImageUrl(d.imageUrl); // unchanged value is always allowed
      if (!image) throw new UserError('That image was not uploaded through the console. Please upload it again.');
    }
    const data = { name: d.name, category: d.category, sku: d.sku ?? null, description: d.description ?? null, imageUrl: image?.url ?? null, imagePublicId: image?.publicId ?? null, unitPrice: toKobo(d.unitPrice), unitCost: toKobo(d.unitCost), active: d.active };
    const p = d.id ? await db.product.update({ where: { id: d.id }, data }) : await db.product.create({ data });
    if (existing?.imagePublicId && existing.imagePublicId !== image?.publicId) await destroyImage(existing.imagePublicId); // replaced or removed
    await audit(s, d.id ? 'product.update' : 'product.create', 'Product', p.id);
    return done('/admin/inventory', d.id ? 'Product updated.' : 'Product added.');
  });
}
export async function stockAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff('OPERATIONS');
    const qty = z.coerce.number().int().refine((n) => n !== 0, 'Quantity cannot be zero').parse(f.get('quantity'));
    const productId = str(f, 'productId');
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
      const p = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      if (p.onHand + qty < p.reserved) throw new UserError(`That would drop stock below the ${p.reserved} units reserved for open orders.`);
      await tx.product.update({ where: { id: productId }, data: { onHand: { increment: qty } } });
      await tx.stockMovement.create({ data: { productId, type: qty > 0 ? 'RECEIPT' : 'WRITE_OFF', quantity: qty, reference: str(f, 'reference') || null, note: str(f, 'note') || null, createdBy: s.id } });
    });
    await audit(s, 'stock.adjust', 'Product', productId, { qty });
    return done('/admin/inventory', 'Stock updated.');
  });
}

/** Short-lived signed ticket so the browser can upload one product image straight to Cloudinary. */
export async function imageUploadTicketAction() {
  return safe(async () => {
    await requireStaff('OPERATIONS');
    if (!cloudinaryEnabled()) throw new UserError('Image upload is not configured yet. Add the CLOUDINARY_* settings.');
    if (!rateLimit(`img-ticket:${clientIp()}`, 60, 3_600_000).ok) throw new UserError('Too many uploads. Try again later.');
    return { ok: true as const, data: uploadTicket() };
  });
}

// ---------- rewards (FINANCE) ----------
export async function rewardStatusAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff('FINANCE', 'OPERATIONS');
    const to = z.enum(['FULFILLED', 'CANCELLED']).parse(str(f, 'to'));
    const r = await db.rewardEntitlement.updateMany({ where: { id: str(f, 'id'), status: 'ELIGIBLE' }, data: { status: to, fulfilledBy: s.id, fulfilledAt: to === 'FULFILLED' ? new Date() : null } });
    if (!r.count) throw new UserError('Only eligible rewards can be updated.');
    await audit(s, `reward.${to.toLowerCase()}`, 'RewardEntitlement', str(f, 'id'));
    return done('/admin/rewards', `Reward ${to.toLowerCase()}.`);
  });
}

// ---------- customers ----------
export async function customerStatusAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff('FINANCE');
    const to = z.enum(['ACTIVE', 'SUSPENDED']).parse(str(f, 'to'));
    await db.customer.update({ where: { id: str(f, 'id') }, data: { status: to } });
    await audit(s, `customer.${to.toLowerCase()}`, 'Customer', str(f, 'id'));
    return done('/admin/customers', `Customer ${to.toLowerCase()}.`);
  });
}

// ---------- packages & benefits (SUPER_ADMIN) ----------
const packageSchema = z.object({
  id: z.string().optional(), name: z.string().trim().min(2).max(60),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Slug: lowercase letters, numbers and dashes'),
  tagline: z.string().trim().max(80).optional(), description: z.string().trim().max(400).optional(),
  targetAmount: z.coerce.number().int().min(1000).max(1_000_000_000), sortOrder: z.coerce.number().int().default(10),
  featured: z.boolean(), active: z.boolean(),
});
export async function savePackageAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff();
    const d = packageSchema.parse({ id: str(f, 'id') || undefined, name: str(f, 'name'), slug: str(f, 'slug'), tagline: str(f, 'tagline') || undefined, description: str(f, 'description') || undefined, targetAmount: str(f, 'targetAmount'), sortOrder: str(f, 'sortOrder') || 10, featured: bool(f, 'featured'), active: bool(f, 'active') });
    const data = { name: d.name, slug: d.slug, tagline: d.tagline ?? null, description: d.description ?? null, targetAmount: toKobo(d.targetAmount), sortOrder: d.sortOrder, featured: d.featured, active: d.active };
    const p = d.id ? await db.package.update({ where: { id: d.id }, data }) : await db.package.create({ data });
    await audit(s, d.id ? 'package.update' : 'package.create', 'Package', p.id);
    return done('/admin/packages', 'Package saved. Existing customer plans keep the target they signed up with.');
  });
}
const benefitSchema = z.object({
  id: z.string().optional(), packageId: z.string().min(1), title: z.string().trim().min(2).max(120), description: z.string().trim().max(300).optional(),
  milestoneAmount: z.coerce.number().int().min(0), productId: z.string().optional(), quantity: z.coerce.number().int().min(1).max(999).default(1), active: z.boolean(),
});
export async function saveBenefitAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff();
    const d = benefitSchema.parse({ id: str(f, 'id') || undefined, packageId: str(f, 'packageId'), title: str(f, 'title'), description: str(f, 'description') || undefined, milestoneAmount: str(f, 'milestoneAmount'), productId: str(f, 'productId') || undefined, quantity: str(f, 'quantity') || 1, active: bool(f, 'active') });
    const data = { packageId: d.packageId, title: d.title, description: d.description ?? null, milestoneAmount: toKobo(d.milestoneAmount), productId: d.productId ?? null, quantity: d.quantity, active: d.active };
    const b = d.id ? await db.packageBenefit.update({ where: { id: d.id }, data }) : await db.packageBenefit.create({ data });
    // Re-evaluate every plan on this package so newly-earned perks appear.
    const goals = await db.goal.findMany({ where: { packageId: d.packageId, status: { in: ['ACTIVE', 'COMPLETED'] } }, select: { id: true } });
    for (const g of goals) await db.$transaction(async (tx) => { await lockGoal(tx, g.id); await syncGoal(tx, g.id); });
    await audit(s, d.id ? 'benefit.update' : 'benefit.create', 'PackageBenefit', b.id);
    return done('/admin/packages', 'Benefit saved.');
  });
}

// ---------- settings (SUPER_ADMIN) ----------
const settingsSchema = z.object({
  campaignName: z.string().trim().min(2).max(80), brandMessage: z.string().trim().max(300),
  registrationOpen: z.boolean(), redemptionOpen: z.boolean(),
  finalRedemptionDeadline: z.coerce.date().optional().or(z.literal('').transform(() => undefined)),
  termsVersion: z.string().trim().min(1).max(20), termsText: z.string().trim().max(10_000), privacyText: z.string().trim().max(10_000),
  supportEmail: z.string().trim().email().optional().or(z.literal('').transform(() => undefined)), supportPhone: z.string().trim().max(30).optional(),
});
export async function saveSettingsAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff();
    const d = settingsSchema.parse({ campaignName: str(f, 'campaignName'), brandMessage: str(f, 'brandMessage'), registrationOpen: bool(f, 'registrationOpen'), redemptionOpen: bool(f, 'redemptionOpen'), finalRedemptionDeadline: str(f, 'finalRedemptionDeadline'), termsVersion: str(f, 'termsVersion'), termsText: str(f, 'termsText'), privacyText: str(f, 'privacyText'), supportEmail: str(f, 'supportEmail'), supportPhone: str(f, 'supportPhone') || undefined });
    await db.setting.upsert({ where: { id: 1 }, update: { ...d, finalRedemptionDeadline: d.finalRedemptionDeadline ?? null, supportEmail: d.supportEmail ?? null }, create: { id: 1, ...d } });
    await audit(s, 'settings.update', 'Setting', '1');
    return done('/admin/settings', 'Settings saved.');
  });
}

// ---------- staff management (SUPER_ADMIN) ----------
export async function createStaffAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff();
    const d = z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(2).max(100), role: z.enum(['SUPER_ADMIN', 'FINANCE', 'OPERATIONS', 'SUPPORT']), password: password.min(12, 'Staff passwords need at least 12 characters') })
      .parse({ email: str(f, 'email'), name: str(f, 'name'), role: str(f, 'role'), password: String(f.get('password') ?? '') });
    if (await db.staffUser.findUnique({ where: { email: d.email } })) throw new UserError('A staff member with that email already exists.');
    const u = await db.staffUser.create({ data: { email: d.email, name: d.name, role: d.role, passwordHash: await hashPassword(d.password) } });
    await audit(s, 'staff.create', 'StaffUser', u.id, { role: d.role });
    return done('/admin/staff', 'Staff member created. Share the password securely.');
  });
}
export async function updateStaffAction(_: unknown, f: FormData) {
  return safe(async () => {
    const s = await requireStaff();
    const id = str(f, 'id');
    const role = z.enum(['SUPER_ADMIN', 'FINANCE', 'OPERATIONS', 'SUPPORT']).parse(str(f, 'role'));
    const active = bool(f, 'active');
    if (id === s.id && (!active || role !== 'SUPER_ADMIN')) throw new UserError('You cannot demote or deactivate yourself.');
    const newPw = String(f.get('password') ?? '');
    const data: Record<string, unknown> = { role, active, sessionVersion: { increment: 1 } }; // invalidates their live sessions
    if (newPw) data.passwordHash = await hashPassword(password.min(12).parse(newPw));
    await db.staffUser.update({ where: { id }, data });
    await audit(s, 'staff.update', 'StaffUser', id, { role, active, passwordChanged: !!newPw });
    return done('/admin/staff', 'Staff member updated.');
  });
}
