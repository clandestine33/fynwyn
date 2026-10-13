/**
 * Row mappers: app entity -> the columns of the matching tab in the Google Sheet.
 * Column names are the sheet's header names (matched case-insensitively), and the first column of each tab is its key.
 */
import { db } from '@/lib/db';
import { asText, type Cell } from '@/lib/sheets';
import { toNaira } from '@/lib/money';

export type EntityType =
  | 'Package' | 'Product' | 'PackageBenefit' | 'Customer' | 'Payment'
  | 'Order' | 'OrderItem' | 'RewardEntitlement' | 'StockMovement' | 'AuditLog';

export type Values = Record<string, Cell>;

export interface Ctx {
  /** Sheet ID of an entity that already has a row mapping ('' if none). Call preload() first. */
  code(type: EntityType, id: string | null | undefined): string;
  preload(type: EntityType, ids: (string | null | undefined)[]): Promise<void>;
  staffEmail(id: string | null | undefined): Promise<string>;
  termsVersion: number;
}

export interface TabDef {
  type: EntityType;
  tab: string;
  prefix: string;
  pad: number;
  columns: string[]; // columns[0] is the key
  /** columns ignored when deciding whether a row changed (they change for reasons that don't matter, e.g. stock moves). */
  volatile?: string[];
  build(ids: string[], ctx: Ctx): Promise<Map<string, Values>>;
}

/** Sheet-friendly timestamp (parsed as a real date/time by Sheets in any locale). */
export const fmt = (d?: Date | null) => (d ? d.toLocaleString('sv-SE', { timeZone: 'Africa/Lagos' }) : '');
const naira = (k: bigint | number) => toNaira(k);
const ORDER_STATUS: Record<string, string> = {
  PENDING_APPROVAL: 'PENDING_DISPATCH_APPROVAL', APPROVED: 'APPROVED_FOR_DISPATCH', OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY', DELIVERED: 'DELIVERED', CANCELLED: 'CANCELLED',
};
const PAY_METHOD = { PAYSTACK: 'Payment provider', BANK_TRANSFER: 'Bank transfer' } as const;
const OPEN_ORDER = ['PENDING_APPROVAL', 'APPROVED', 'OUT_FOR_DELIVERY'];

const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
const zipMap = (ids: string[], f: (id: string) => Values | null | undefined) => {
  const m = new Map<string, Values>();
  for (const id of ids) { const v = f(id); if (v) m.set(id, v); }
  return m;
};

export const TABS: TabDef[] = [
  {
    type: 'Package', tab: 'PACKAGES', prefix: 'PKG', pad: 3,
    columns: ['PackageID', 'PackageName', 'TargetAmount', 'Description', 'Active', 'SortOrder', 'TermsVersion', 'UpdatedAt'],
    async build(ids, ctx) {
      const rows = byId(await db.package.findMany({ where: { id: { in: ids } } }));
      return zipMap(ids, (id) => { const p = rows.get(id); return p && {
        PackageName: asText(p.name), TargetAmount: naira(p.targetAmount), Description: asText(p.description ?? p.tagline), Active: p.active,
        SortOrder: p.sortOrder, TermsVersion: ctx.termsVersion, UpdatedAt: fmt(p.updatedAt),
      }; });
    },
  },
  {
    type: 'Product', tab: 'PRODUCTS', prefix: 'PROD', pad: 3, volatile: ['UpdatedAt'],
    columns: ['ProductID', 'Name', 'Category', 'Description', 'UnitPrice', 'UnitCost', 'SKU', 'Active', 'ImageURL', 'UpdatedAt'],
    async build(ids) {
      const rows = byId(await db.product.findMany({ where: { id: { in: ids } } }));
      return zipMap(ids, (id) => { const p = rows.get(id); return p && {
        Name: asText(p.name), Category: asText(p.category), Description: asText(p.description), UnitPrice: naira(p.unitPrice), UnitCost: naira(p.unitCost),
        SKU: asText(p.sku), Active: p.active, ImageURL: p.imageUrl ?? '', UpdatedAt: fmt(p.updatedAt),
      }; });
    },
  },
  {
    type: 'PackageBenefit', tab: 'PACKAGE_REWARDS', prefix: 'RR', pad: 3,
    columns: ['RewardRuleID', 'PackageID', 'MilestoneAmount', 'RewardProductID', 'RewardName', 'RewardQuantity', 'Active', 'RuleVersion', 'UpdatedAt'],
    async build(ids, ctx) {
      const rows = await db.packageBenefit.findMany({ where: { id: { in: ids } } });
      await ctx.preload('Package', rows.map((r) => r.packageId)); await ctx.preload('Product', rows.map((r) => r.productId));
      const m = byId(rows);
      return zipMap(ids, (id) => { const b = m.get(id); return b && {
        PackageID: ctx.code('Package', b.packageId), MilestoneAmount: naira(b.milestoneAmount), RewardProductID: ctx.code('Product', b.productId),
        RewardName: asText(b.title), RewardQuantity: b.quantity, Active: b.active, RuleVersion: 1, UpdatedAt: fmt(b.updatedAt),
      }; });
    },
  },
  {
    type: 'Customer', tab: 'CUSTOMERS', prefix: 'FDB', pad: 5,
    columns: ['CustomerID', 'CreatedAt', 'FullName', 'Email', 'Phone', 'SelectedPackageID', 'AccountStatus', 'StaffApprovalStatus', 'EmailVerified', 'TermsVersion', 'Notes'],
    async build(ids, ctx) {
      const rows = await db.customer.findMany({ where: { id: { in: ids } } });
      await ctx.preload('Package', rows.map((r) => r.preferredPackageId));
      const m = byId(rows);
      return zipMap(ids, (id) => { const c = m.get(id); return c && {
        CreatedAt: fmt(c.createdAt), FullName: asText(c.name), Email: asText(c.email), Phone: asText(c.phone),
        SelectedPackageID: ctx.code('Package', c.preferredPackageId), AccountStatus: c.status, StaffApprovalStatus: 'NOT_REQUIRED',
        EmailVerified: !!c.emailVerifiedAt, TermsVersion: Number.parseInt(c.termsVersion ?? '', 10) || ctx.termsVersion, Notes: 'Web sign-up',
      }; });
    },
  },
  {
    type: 'Payment', tab: 'TRANSACTIONS', prefix: 'PAY', pad: 5,
    columns: ['TransactionID', 'CustomerID', 'SubmittedAt', 'Amount', 'PaymentMethod', 'PaymentReference', 'ProofURL', 'Status', 'VerifiedAt', 'VerifiedBy', 'ReversalOf', 'Notes'],
    async build(ids, ctx) {
      const rows = await db.payment.findMany({ where: { id: { in: ids } }, include: { goal: { select: { title: true } } } });
      await ctx.preload('Customer', rows.map((r) => r.customerId));
      const m = byId(rows);
      const out = new Map<string, Values>();
      for (const id of ids) {
        const p = m.get(id); if (!p) continue;
        const by = p.verifiedBy ? await ctx.staffEmail(p.verifiedBy) : p.method === 'PAYSTACK' && p.status === 'VERIFIED' ? 'PAYSTACK' : '';
        out.set(id, {
          CustomerID: ctx.code('Customer', p.customerId), SubmittedAt: fmt(p.createdAt), Amount: naira(p.amount), PaymentMethod: PAY_METHOD[p.method],
          PaymentReference: asText(p.reference), ProofURL: p.proofUrl ?? '', Status: p.status, VerifiedAt: fmt(p.verifiedAt), VerifiedBy: by, ReversalOf: '',
          Notes: asText([`Plan: ${p.goal.title}`, p.rejectReason].filter(Boolean).join(' · ')),
        });
      }
      return out;
    },
  },
  {
    type: 'Order', tab: 'ORDERS', prefix: 'ORD', pad: 5,
    columns: ['OrderID', 'CustomerID', 'CreatedAt', 'RequestedDeliveryDate', 'DeliveryAddress', 'DeliveryPhone', 'CustomerNote', 'OrderStatus', 'CreditReserved', 'CreditDeducted',
      'StockReserved', 'DispatchApprovedBy', 'DispatchApprovedAt', 'DeliveredAt', 'CancelledAt', 'Notes'],
    async build(ids, ctx) {
      const rows = await db.order.findMany({ where: { id: { in: ids } }, include: { goal: { select: { title: true } } } });
      await ctx.preload('Customer', rows.map((r) => r.customerId));
      const m = byId(rows);
      const out = new Map<string, Values>();
      for (const id of ids) {
        const o = m.get(id); if (!o) continue;
        out.set(id, {
          CustomerID: ctx.code('Customer', o.customerId), CreatedAt: fmt(o.createdAt), RequestedDeliveryDate: fmt(o.deliveryDate).slice(0, 10),
          DeliveryAddress: asText(o.deliveryAddress), DeliveryPhone: asText(o.deliveryPhone), CustomerNote: asText(o.deliveryNote), OrderStatus: ORDER_STATUS[o.status],
          CreditReserved: o.status === 'CANCELLED' ? 0 : naira(o.total), CreditDeducted: o.status === 'DELIVERED' ? naira(o.total) : 0, StockReserved: OPEN_ORDER.includes(o.status),
          DispatchApprovedBy: o.approvedBy ? await ctx.staffEmail(o.approvedBy) : '', DispatchApprovedAt: fmt(o.approvedAt), DeliveredAt: fmt(o.deliveredAt), CancelledAt: fmt(o.cancelledAt),
          Notes: asText([`App order ${o.number}`, `Plan: ${o.goal.title}`, o.cancelReason].filter(Boolean).join(' · ')),
        });
      }
      return out;
    },
  },
  {
    type: 'OrderItem', tab: 'ORDER_ITEMS', prefix: 'OI', pad: 5,
    columns: ['OrderItemID', 'OrderID', 'CustomerID', 'ProductID', 'ProductNameSnapshot', 'Quantity', 'UnitPriceSnapshot', 'LineTotal', 'UnitCostSnapshot', 'Status'],
    async build(ids, ctx) {
      const rows = await db.orderItem.findMany({ where: { id: { in: ids } }, include: { order: { select: { id: true, customerId: true, status: true } }, product: { select: { unitCost: true } } } });
      await ctx.preload('Order', rows.map((r) => r.orderId)); await ctx.preload('Customer', rows.map((r) => r.order.customerId)); await ctx.preload('Product', rows.map((r) => r.productId));
      const m = byId(rows);
      return zipMap(ids, (id) => { const i = m.get(id); return i && {
        OrderID: ctx.code('Order', i.orderId), CustomerID: ctx.code('Customer', i.order.customerId), ProductID: ctx.code('Product', i.productId), ProductNameSnapshot: asText(i.name),
        Quantity: i.quantity, UnitPriceSnapshot: naira(i.unitPrice), LineTotal: naira(i.unitPrice * BigInt(i.quantity)), UnitCostSnapshot: naira(i.product.unitCost), Status: ORDER_STATUS[i.order.status],
      }; });
    },
  },
  {
    type: 'RewardEntitlement', tab: 'REWARD_ENTITLEMENTS', prefix: 'ENT', pad: 5,
    columns: ['EntitlementID', 'CustomerID', 'RewardRuleID', 'PackageIDAtCalculation', 'RewardNameSnapshot', 'RewardProductID', 'Quantity', 'Status', 'CalculatedAt', 'ReservedOrderID', 'FulfilledAt', 'RuleVersion', 'Notes'],
    async build(ids, ctx) {
      const rows = await db.rewardEntitlement.findMany({ where: { id: { in: ids } }, include: { goal: { select: { customerId: true, title: true } }, benefit: { select: { packageId: true, productId: true } } } });
      await ctx.preload('Customer', rows.map((r) => r.goal.customerId)); await ctx.preload('PackageBenefit', rows.map((r) => r.benefitId));
      await ctx.preload('Package', rows.map((r) => r.benefit.packageId)); await ctx.preload('Product', rows.map((r) => r.benefit.productId));
      const m = byId(rows);
      return zipMap(ids, (id) => { const e = m.get(id); return e && {
        CustomerID: ctx.code('Customer', e.goal.customerId), RewardRuleID: ctx.code('PackageBenefit', e.benefitId), PackageIDAtCalculation: ctx.code('Package', e.benefit.packageId),
        RewardNameSnapshot: asText(e.titleSnapshot), RewardProductID: ctx.code('Product', e.benefit.productId), Quantity: e.quantity, Status: e.status, CalculatedAt: fmt(e.createdAt),
        ReservedOrderID: '', FulfilledAt: fmt(e.fulfilledAt), RuleVersion: 1, Notes: asText(`Plan: ${e.goal.title}`),
      }; });
    },
  },
  {
    type: 'StockMovement', tab: 'INVENTORY_MOVEMENTS', prefix: 'MOV', pad: 5,
    columns: ['MovementID', 'Timestamp', 'ProductID', 'MovementType', 'QuantityChange', 'Reference', 'Notes', 'StaffEmail'],
    async build(ids, ctx) {
      const rows = await db.stockMovement.findMany({ where: { id: { in: ids } } });
      await ctx.preload('Product', rows.map((r) => r.productId));
      const m = byId(rows);
      const out = new Map<string, Values>();
      for (const id of ids) {
        const s = m.get(id); if (!s) continue;
        // RECEIPT / WRITE_OFF / DISPATCH are stored as signed on-hand changes. RESERVE / RELEASE are shown as the change to *available* stock.
        const change = s.type === 'RESERVE' ? -s.quantity : s.quantity;
        out.set(id, { Timestamp: fmt(s.createdAt), ProductID: ctx.code('Product', s.productId), MovementType: s.type, QuantityChange: change, Reference: asText(s.reference), Notes: asText(s.note), StaffEmail: s.createdBy ? await ctx.staffEmail(s.createdBy) : '' });
      }
      return out;
    },
  },
  {
    type: 'AuditLog', tab: 'AUDIT_LOG', prefix: 'AUD', pad: 5,
    columns: ['AuditID', 'Timestamp', 'Actor', 'Action', 'EntityType', 'EntityID', 'BeforeJSON', 'AfterJSON', 'Notes'],
    async build(ids, ctx) {
      const rows = await db.auditLog.findMany({ where: { id: { in: ids } } });
      for (const t of ['Customer', 'Payment', 'Order', 'Package', 'PackageBenefit', 'Product', 'RewardEntitlement'] as const) {
        await ctx.preload(t, rows.filter((r) => r.entity === t).map((r) => r.entityId));
      }
      const m = byId(rows);
      return zipMap(ids, (id) => { const a = m.get(id); if (!a) return null;
        const entity = (a.entity ?? '') as EntityType;
        return {
          Timestamp: fmt(a.createdAt), Actor: a.staffEmail ?? 'SYSTEM', Action: a.action.toUpperCase().replace(/[.\s-]+/g, '_'), EntityType: (a.entity ?? '').toUpperCase(),
          EntityID: (a.entityId && ctx.code(entity, a.entityId)) || a.entityId || '', BeforeJSON: '', AfterJSON: a.meta ? asText(JSON.stringify(a.meta)) : '', Notes: asText(a.ip ? `IP ${a.ip}` : ''),
        };
      });
    },
  },
];
