import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import { db } from '@/lib/db';
import { register, verifyEmail } from '@/server/auth';
import { createGoal, upgradeGoal } from '@/server/goals';
import { createOrder, setOrderStatus } from '@/server/orders';
import { adjustCredit, rejectPayment, submitTransfer, verifyTransfer } from '@/server/payments';
import { runSheetSync } from '@/server/sheet-sync';
import { sha256 } from '@/lib/crypto';
import type { Package, Product, StaffUser } from '@prisma/client';

// ---------- in-memory fake of the Google Sheets API ----------
const HEADERS: Record<string, string[]> = {
  CUSTOMERS: ['CustomerID', 'CreatedAt', 'FullName', 'Email', 'Phone', 'SelectedPackageID', 'AccountStatus', 'StaffApprovalStatus', 'EmailVerified', 'TermsVersion', 'Notes', 'Internal'],
  TRANSACTIONS: ['TransactionID', 'CustomerID', 'SubmittedAt', 'Amount', 'PaymentMethod', 'PaymentReference', 'ProofURL', 'Status', 'VerifiedAt', 'VerifiedBy', 'ReversalOf', 'Notes'],
  ORDERS: ['OrderID', 'CustomerID', 'CreatedAt', 'RequestedDeliveryDate', 'DeliveryAddress', 'DeliveryPhone', 'CustomerNote', 'OrderStatus', 'CreditReserved', 'CreditDeducted', 'StockReserved', 'DispatchApprovedBy', 'DispatchApprovedAt', 'DeliveredAt', 'CancelledAt', 'Notes'],
  ORDER_ITEMS: ['OrderItemID', 'OrderID', 'CustomerID', 'ProductID', 'ProductNameSnapshot', 'Quantity', 'UnitPriceSnapshot', 'LineTotal', 'UnitCostSnapshot', 'Status'],
  REWARD_ENTITLEMENTS: ['EntitlementID', 'CustomerID', 'RewardRuleID', 'PackageIDAtCalculation', 'RewardNameSnapshot', 'RewardProductID', 'Quantity', 'Status', 'CalculatedAt', 'ReservedOrderID', 'FulfilledAt', 'RuleVersion', 'Notes'],
  PACKAGES: ['PackageID', 'PackageName', 'TargetAmount', 'Description', 'Active', 'SortOrder', 'TermsVersion', 'UpdatedAt'],
  PACKAGE_REWARDS: ['RewardRuleID', 'PackageID', 'MilestoneAmount', 'RewardProductID', 'RewardName', 'RewardQuantity', 'Active', 'RuleVersion', 'UpdatedAt'],
  PRODUCTS: ['ProductID', 'Name', 'Category', 'Description', 'UnitPrice', 'UnitCost', 'SKU', 'Active', 'ImageURL', 'UpdatedAt'],
  INVENTORY_MOVEMENTS: ['MovementID', 'Timestamp', 'ProductID', 'MovementType', 'QuantityChange', 'Reference', 'Notes', 'StaffEmail'],
  AUDIT_LOG: ['AuditID', 'Timestamp', 'Actor', 'Action', 'EntityType', 'EntityID', 'BeforeJSON', 'AfterJSON', 'Notes'],
};
let grids = new Map<string, string[][]>();
let log: { op: 'update' | 'append' | 'read'; tab: string; n: number }[] = [];
let failAppendFor: string | null = null;

function resetSheet() {
  grids = new Map(Object.entries(HEADERS).map(([t, h]) => [t, [h]]));
  grids.get('CUSTOMERS')!.push(['FDB-00001', '10/12/2026 15:44:47', 'Legacy One', 'legacy1@example.test', '09000000001', 'PKG-050', 'ACTIVE', 'APPROVED', 'TRUE', '1', 'Google Form registration', 'keep me'],
    ['FDB-00002', '10/12/2026 16:19:32', 'Legacy Two', 'legacy2@example.test', '09000000002', 'PKG-050', 'ACTIVE', 'APPROVED', 'TRUE', '1', 'Google Form registration', 'keep me too']);
  grids.get('PACKAGES')!.push(['PKG-050', 'Starter', '50000', 'Starter package', 'TRUE', '1', '1', '10/12/2026 15:03:47']);
  grids.get('TRANSACTIONS')!.push(['PAY-00007', 'FDB-00001', '10/12/2026', '1000', 'Bank transfer', 'OLD', '', 'REVERSED', '', '', '', '']);
  log = []; failAppendFor = null;
}
const cell = (v: unknown) => { if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; let s = String(v ?? ''); if (s.startsWith("'")) s = s.slice(1); return s; };
const colNo = (L: string) => [...L].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
function parse(range: string) {
  const m = /^'((?:[^']|'')+)'!(.+)$/.exec(decodeURIComponent(range))!;
  return { tab: m[1].replace(/''/g, "'"), a1: m[2] };
}
const rowOfEmail = (tab: string, col: string, needle: string) => grids.get(tab)!.find((r) => r[HEADERS[tab].indexOf(col)] === needle);

let server: http.Server;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', () => {
      const send = (code: number, o: unknown) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      const url = req.url!;
      if (url.startsWith('/token')) return send(200, { access_token: 'tok', expires_in: 3600 });
      const base = `/v4/spreadsheets/FAKESHEET`;
      if (req.method === 'GET' && url.startsWith(`${base}/values/`)) {
        const { tab, a1 } = parse(url.slice(`${base}/values/`.length).split('?')[0]);
        const g = grids.get(tab); if (!g) return send(400, { error: 'no such tab' });
        log.push({ op: 'read', tab, n: 1 });
        if (/^1:1$/.test(a1)) return send(200, { values: [g[0]] });
        const col = /^([A-Z]+):\1$/.exec(a1); if (col) return send(200, { values: g.map((r) => [r[colNo(col[1])] ?? '']).map((r) => (r[0] === '' ? [] : r)) });
        return send(400, { error: 'unsupported range ' + a1 });
      }
      if (req.method === 'POST' && url.startsWith(`${base}/values:batchUpdate`)) {
        const { data } = JSON.parse(body) as { data: { range: string; values: unknown[][] }[] };
        for (const d of data) {
          const { tab, a1 } = parse(d.range); const m = /^([A-Z]+)(\d+):([A-Z]+)\d+$/.exec(a1)!;
          const g = grids.get(tab)!; const row = Number(m[2]) - 1; const c0 = colNo(m[1]);
          while (g.length <= row) g.push([]);
          d.values[0].forEach((v, i) => { g[row][c0 + i] = cell(v); });
          log.push({ op: 'update', tab, n: 1 });
        }
        return send(200, {});
      }
      if (req.method === 'POST' && url.includes(':append')) {
        const { tab } = parse(url.slice(`${base}/values/`.length).split(':append')[0].replace(/!A1$/, '!A1'));
        if (failAppendFor === tab) return send(500, { error: 'boom' });
        const { values } = JSON.parse(body) as { values: unknown[][] };
        for (const r of values) grids.get(tab)!.push(r.map(cell));
        log.push({ op: 'append', tab, n: values.length });
        return send(200, {});
      }
      send(404, { error: 'not found ' + url });
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
});

// ---------- fixtures ----------
const tag = `shm${Date.now()}`;
const k = (n: number) => BigInt(n * 100);
const future = new Date(Date.now() + 90 * 86_400_000);
let pkgA: Package, pkgB: Package, wine: Product, staff: StaffUser;
let snapshotRows = new Set<string>(); let snapshotCounters: { prefix: string; last: number }[] = [];
const created = { customers: [] as string[] };

beforeAll(async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const port = (server.address() as AddressInfo).port;
  Object.assign(process.env, {
    GOOGLE_SHEETS_ID: 'FAKESHEET', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'bot@proj.iam.gserviceaccount.com', GOOGLE_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
    GOOGLE_SHEETS_API_BASE: `http://127.0.0.1:${port}`, GOOGLE_TOKEN_URL: `http://127.0.0.1:${port}/token`,
  });
  snapshotRows = new Set((await db.sheetRow.findMany({ select: { id: true } })).map((r) => r.id));
  snapshotCounters = await db.sheetCounter.findMany();
  staff = await db.staffUser.create({ data: { email: `${tag}-staff@test.local`, name: 'Sheet Staff', role: 'FINANCE', passwordHash: 'x' } });
  pkgA = await db.package.create({ data: { slug: `${tag}a`, name: 'Alpha', targetAmount: k(100_000), benefits: { create: [{ title: 'Included perk', milestoneAmount: 0n }, { title: 'Half perk', milestoneAmount: k(50_000) }] } } });
  pkgB = await db.package.create({ data: { slug: `${tag}b`, name: 'Beta', targetAmount: k(500_000) } });
  wine = await db.product.create({ data: { name: `Wine ${tag}`, sku: `SKU-${tag}`, unitPrice: k(10_000), onHand: 20 } });
  // NOTE: set the cut-off AFTER the fixtures above so they count as "new", but make an older customer to prove old data is ignored
  await new Promise((r) => setTimeout(r, 30));
});

beforeEach(async () => {
  resetSheet();
  // each test starts from a clean mirror: no leftover ID mappings/counters from earlier tests, and a fresh cut-off date
  await db.sheetRow.deleteMany({ where: { id: { notIn: [...snapshotRows] } } });
  await db.sheetCounter.deleteMany({});
  for (const c of snapshotCounters) await db.sheetCounter.create({ data: c });
  await new Promise((r) => setTimeout(r, 15));
  process.env.SHEET_SYNC_SINCE = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 15));
});

afterAll(async () => {
  server.close();
  const goals = (await db.goal.findMany({ where: { customerId: { in: created.customers } }, select: { id: true } })).map((g) => g.id);
  await db.rewardEntitlement.deleteMany({ where: { goalId: { in: goals } } });
  await db.ledgerEntry.deleteMany({ where: { goalId: { in: goals } } });
  await db.orderItem.deleteMany({ where: { order: { customerId: { in: created.customers } } } });
  await db.order.deleteMany({ where: { customerId: { in: created.customers } } });
  await db.payment.deleteMany({ where: { customerId: { in: created.customers } } });
  await db.goal.deleteMany({ where: { id: { in: goals } } });
  await db.authToken.deleteMany({ where: { customerId: { in: created.customers } } });
  await db.customer.deleteMany({ where: { id: { in: created.customers } } });
  await db.stockMovement.deleteMany({ where: { productId: wine.id } });
  await db.auditLog.deleteMany({ where: { action: { startsWith: `${tag}.` } } });
  await db.product.delete({ where: { id: wine.id } });
  await db.package.deleteMany({ where: { id: { in: [pkgA.id, pkgB.id] } } });
  await db.staffUser.delete({ where: { id: staff.id } });
  // leave the real mirror bookkeeping exactly as it was before this test ran
  await db.sheetRow.deleteMany({ where: { id: { notIn: [...snapshotRows] } } });
  await db.sheetCounter.deleteMany({});
  for (const c of snapshotCounters) await db.sheetCounter.create({ data: c });
  for (const key of ['GOOGLE_SHEETS_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SHEETS_API_BASE', 'GOOGLE_TOKEN_URL', 'SHEET_SYNC_SINCE']) delete process.env[key];
  await db.$disconnect();
});

const writes = () => log.filter((l) => l.op !== 'read');
const sync = async () => { const r = await runSheetSync(); expect(r.errors).toEqual([]); return r; };

describe('sheet mirror', () => {
  it('stays off until configured, and never pushes data older than SHEET_SYNC_SINCE', async () => {
    delete process.env.SHEET_SYNC_SINCE;
    expect((await runSheetSync()).skipped).toBeTruthy();
    expect(log).toEqual([]);

    const old = await db.customer.create({ data: { email: `${tag}-old@test.local`, name: 'Old Timer', passwordHash: 'x' } }); created.customers.push(old.id);
    await new Promise((r) => setTimeout(r, 20));
    process.env.SHEET_SYNC_SINCE = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 20));
    await sync();
    expect(rowOfEmail('CUSTOMERS', 'Email', `${tag}-old@test.local`)).toBeUndefined();
  });

  it('customer lifecycle: appended after the legacy rows, updated in place, extra columns preserved', async () => {
    const c = await register({ name: 'Ada Obi', email: `${tag}-ada@test.local`, phone: '09017858371', password: 'Correct-Horse-9', acceptTerms: true });
    created.customers.push(c.id);
    await sync();
    const g = grids.get('CUSTOMERS')!;
    let row = rowOfEmail('CUSTOMERS', 'Email', `${tag}-ada@test.local`)!;
    expect(row).toBeDefined();
    const H = HEADERS.CUSTOMERS; const v = (name: string) => row[H.indexOf(name)];
    expect(v('CustomerID')).toBe('FDB-00003'); // continues after FDB-00002 already in the sheet
    expect([v('FullName'), v('Phone'), v('SelectedPackageID'), v('AccountStatus'), v('EmailVerified'), v('Notes')]).toEqual(['Ada Obi', '09017858371', '', 'ACTIVE', 'FALSE', 'Web sign-up']);
    expect(g.length).toBe(4); // header + 2 legacy + 1 new
    expect(g[1][11]).toBe('keep me'); // legacy rows untouched

    // first plan fills the (empty) selected package -> same row updated in place, package row created after legacy PKG-050
    await createGoal(c.id, { title: 'Ada 40th', occasion: 'BIRTHDAY', eventDate: future, packageId: pkgA.id });
    await sync();
    row = rowOfEmail('CUSTOMERS', 'Email', `${tag}-ada@test.local`)!;
    expect(grids.get('CUSTOMERS')!.length).toBe(4);
    expect(row[H.indexOf('SelectedPackageID')]).toBe('PKG-051');
    const pk = rowOfEmail('PACKAGES', 'PackageID', 'PKG-051')!; expect(pk.slice(1, 3)).toEqual(['Alpha', '100000']);
    expect(rowOfEmail('PACKAGE_REWARDS', 'RewardName', 'Included perk')![1]).toBe('PKG-051');

    // verifying the email flips EmailVerified in place
    await db.authToken.create({ data: { customerId: c.id, type: 'EMAIL_VERIFY', tokenHash: sha256('t'.repeat(64)), expiresAt: new Date(Date.now() + 60_000) } });
    await verifyEmail('t'.repeat(64));
    await sync();
    expect(rowOfEmail('CUSTOMERS', 'Email', `${tag}-ada@test.local`)![H.indexOf('EmailVerified')]).toBe('TRUE');
    expect(grids.get('CUSTOMERS')!.length).toBe(4);

    // nothing changed -> no API writes at all
    log = []; await sync(); expect(writes()).toEqual([]);

    // upgrading changes the selected package
    await upgradeGoal(c.id, (await db.goal.findFirstOrThrow({ where: { customerId: c.id } })).id, pkgB.id);
    await sync();
    expect(rowOfEmail('CUSTOMERS', 'Email', `${tag}-ada@test.local`)![H.indexOf('SelectedPackageID')]).toBe('PKG-052');
  });

  it('a package chosen at sign-up is kept (not overwritten by the first plan)', async () => {
    const c = await register({ name: 'Picky', email: `${tag}-picky@test.local`, password: 'Correct-Horse-9', preferredPackageId: pkgB.id, acceptTerms: true }); created.customers.push(c.id);
    await createGoal(c.id, { title: 'Picky plan', occasion: 'OTHER', eventDate: future, packageId: pkgA.id });
    await sync();
    const row = rowOfEmail('CUSTOMERS', 'Email', `${tag}-picky@test.local`)!;
    expect(rowOfEmail('PACKAGES', 'PackageID', row[HEADERS.CUSTOMERS.indexOf('SelectedPackageID')])![1]).toBe('Beta');
  });

  it('payments, rewards, orders, order items, stock movements follow the app', async () => {
    const c = await register({ name: 'Pay Er', email: `${tag}-pay@test.local`, password: 'Correct-Horse-9', acceptTerms: true }); created.customers.push(c.id);
    await db.customer.update({ where: { id: c.id }, data: { emailVerifiedAt: new Date() } });
    const cust = await db.customer.findUniqueOrThrow({ where: { id: c.id } });
    const goal = await createGoal(c.id, { title: 'Pay plan', occasion: 'WEDDING', eventDate: future, packageId: pkgA.id });
    const p1 = await submitTransfer(cust, { goalId: goal.id, amount: 60_000, reference: `${tag}-REF1` });
    const p2 = await submitTransfer(cust, { goalId: goal.id, amount: 5_000, reference: `${tag}-REF2` });
    await sync();
    const T = HEADERS.TRANSACTIONS; const cid = rowOfEmail('CUSTOMERS', 'Email', `${tag}-pay@test.local`)![0];
    let t1 = rowOfEmail('TRANSACTIONS', 'PaymentReference', `${tag}-REF1`.toUpperCase())!;
    expect([t1[T.indexOf('CustomerID')], t1[T.indexOf('Amount')], t1[T.indexOf('PaymentMethod')], t1[T.indexOf('Status')]]).toEqual([cid, '60000', 'Bank transfer', 'PENDING']);
    expect(t1[0]).toBe('PAY-00008'); // after legacy PAY-00007
    expect(rowOfEmail('REWARD_ENTITLEMENTS', 'RewardNameSnapshot', 'Included perk')![1]).toBe(cid); // "included" perk exists from the start

    await verifyTransfer(p1.id, staff); await rejectPayment(p2.id, 'no match');
    await sync();
    t1 = rowOfEmail('TRANSACTIONS', 'PaymentReference', `${tag}-REF1`.toUpperCase())!;
    expect([t1[T.indexOf('Status')], t1[T.indexOf('VerifiedBy')]]).toEqual(['VERIFIED', staff.email]);
    expect(grids.get('TRANSACTIONS')!.filter((r) => r[T.indexOf('PaymentReference')]?.startsWith(tag.toUpperCase()) || r[T.indexOf('PaymentReference')]?.startsWith(`'${tag}`)).length).toBe(2);
    expect(rowOfEmail('TRANSACTIONS', 'PaymentReference', `${tag}-REF2`.toUpperCase())![T.indexOf('Status')]).toBe('REJECTED');
    expect(rowOfEmail('REWARD_ENTITLEMENTS', 'RewardNameSnapshot', 'Half perk')![7]).toBe('ELIGIBLE'); // 60k crossed the 50k milestone

    // order lifecycle
    const o = await createOrder(cust, { goalId: goal.id, items: [{ productId: wine.id, quantity: 3 }], deliveryAddress: '12 Test Street, Lagos', deliveryPhone: '08012345678' });
    await sync();
    const O = HEADERS.ORDERS; let orow = rowOfEmail('ORDERS', 'CustomerID', cid)!;
    expect([orow[O.indexOf('OrderStatus')], orow[O.indexOf('CreditReserved')], orow[O.indexOf('CreditDeducted')], orow[O.indexOf('StockReserved')]]).toEqual(['PENDING_DISPATCH_APPROVAL', '30000', '0', 'TRUE']);
    expect(orow[O.indexOf('Notes')]).toContain(o.number);
    const item = rowOfEmail('ORDER_ITEMS', 'OrderID', orow[0])!; const I = HEADERS.ORDER_ITEMS;
    expect([item[I.indexOf('Quantity')], item[I.indexOf('UnitPriceSnapshot')], item[I.indexOf('LineTotal')]]).toEqual(['3', '10000', '30000']);
    const prodRow = rowOfEmail('PRODUCTS', 'SKU', `SKU-${tag}`)!; expect(prodRow[item && I.indexOf('ProductID') >= 0 ? 0 : 0]).toBe(item[I.indexOf('ProductID')]);
    const mv = grids.get('INVENTORY_MOVEMENTS')!.slice(1).filter((r) => r[2] === item[I.indexOf('ProductID')]);
    expect(mv.map((r) => [r[3], r[4]])).toEqual([['RESERVE', '-3']]);

    await setOrderStatus(o.id, 'APPROVED', staff); await setOrderStatus(o.id, 'DELIVERED', staff);
    await sync();
    orow = rowOfEmail('ORDERS', 'CustomerID', cid)!;
    expect([orow[O.indexOf('OrderStatus')], orow[O.indexOf('CreditDeducted')], orow[O.indexOf('StockReserved')], orow[O.indexOf('DispatchApprovedBy')]]).toEqual(['DELIVERED', '30000', 'FALSE', staff.email]);
    expect(orow[O.indexOf('DeliveredAt')]).not.toBe('');
    expect(rowOfEmail('ORDER_ITEMS', 'OrderID', orow[0])![I.indexOf('Status')]).toBe('DELIVERED');
    expect(grids.get('ORDERS')!.length).toBe(2); // one order row, updated in place
    expect(grids.get('INVENTORY_MOVEMENTS')!.slice(1).filter((r) => r[2] === item[I.indexOf('ProductID')]).map((r) => r[3])).toEqual(['RESERVE', 'DISPATCH']);

    // staff/audit entries
    await db.auditLog.create({ data: { action: `${tag}.payment.verify`, entity: 'Payment', entityId: p1.id, staffId: staff.id, staffEmail: staff.email, meta: { amount: '6000000' } } });
    await adjustCredit(goal.id, staff, 100, 'goodwill');
    await sync();
    const au = grids.get('AUDIT_LOG')!.find((r) => r[3] === `${tag.toUpperCase()}_PAYMENT_VERIFY`)!;
    expect([au[2], au[4], au[5], au[7]]).toEqual([staff.email, 'PAYMENT', t1[0], '{"amount":"6000000"}']);
  });

  it('retries failed writes without duplicating rows', async () => {
    const c = await register({ name: 'Retry Me', email: `${tag}-retry@test.local`, password: 'Correct-Horse-9', acceptTerms: true }); created.customers.push(c.id);
    failAppendFor = 'CUSTOMERS';
    const r = await runSheetSync();
    expect(r.errors.join()).toContain('Sheets POST');
    expect(rowOfEmail('CUSTOMERS', 'Email', `${tag}-retry@test.local`)).toBeUndefined();
    failAppendFor = null;
    await sync();
    await sync();
    expect(grids.get('CUSTOMERS')!.filter((x) => x[3] === `${tag}-retry@test.local`)).toHaveLength(1);
  });

  it('refuses to write to a tab whose columns changed, and says which one', async () => {
    grids.get('CUSTOMERS')![0] = HEADERS.CUSTOMERS.filter((h) => h !== 'Phone');
    const c = await register({ name: 'Col Test', email: `${tag}-col@test.local`, password: 'Correct-Horse-9', acceptTerms: true }); created.customers.push(c.id);
    const r = await runSheetSync();
    expect(r.errors.join()).toMatch(/CUSTOMERS: sheet is missing column\(s\) Phone/);
    expect(grids.get('CUSTOMERS')!.length).toBe(3); // nothing appended
  });

  it('survives reordered columns', async () => {
    const swapped = [...HEADERS.CUSTOMERS]; [swapped[2], swapped[3]] = [swapped[3], swapped[2]]; // Email before FullName
    grids.get('CUSTOMERS')![0] = swapped;
    const c = await register({ name: 'Swap Test', email: `${tag}-swap@test.local`, password: 'Correct-Horse-9', acceptTerms: true }); created.customers.push(c.id);
    await sync();
    const row = grids.get('CUSTOMERS')!.find((r) => r[2] === `${tag}-swap@test.local`)!;
    expect(row[3]).toBe('Swap Test');
  });

  it('two overlapping syncs never duplicate rows', async () => {
    const c = await register({ name: 'Racer', email: `${tag}-race@test.local`, password: 'Correct-Horse-9', acceptTerms: true }); created.customers.push(c.id);
    const reports = await Promise.all([runSheetSync(), runSheetSync(), runSheetSync()]);
    expect(reports.flatMap((r) => r.errors)).toEqual([]);
    expect(grids.get('CUSTOMERS')!.filter((x) => x[3] === `${tag}-race@test.local`)).toHaveLength(1);
  });

  it('neutralises formula injection and never mirrors credentials', async () => {
    const c = await register({ name: '=HYPERLINK("http://evil","x")', email: `${tag}-inj@test.local`, password: 'Correct-Horse-9', acceptTerms: true }); created.customers.push(c.id);
    await sync();
    const row = grids.get('CUSTOMERS')!.find((r) => r[3] === `${tag}-inj@test.local`)!;
    expect(row[2]).toBe('=HYPERLINK("http://evil","x")'); // stored as text (the fake strips the leading apostrophe like Sheets does)
    const everything = JSON.stringify([...grids.values()]);
    expect(everything).not.toMatch(/Correct-Horse|passwordHash|\$2[aby]\$/);
    expect([...grids.keys()]).not.toContain('CUSTOMER_AUTH');
  });
});
