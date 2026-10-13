import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db, type Tx } from '@/lib/db';
import { appendRows, readColumn, readHeader, sheetsEnabled, updateRanges, type Cell, type RangeWrite } from '@/lib/sheets';
import { TABS, type Ctx, type EntityType, type TabDef, type Values } from './sheet-map';

/**
 * One-way mirror: app database -> Google Sheet.
 *
 *  - The database is the source of truth. The sheet is a reporting copy (edit data in the app, not the sheet).
 *  - Each sweep finds entities that are new or changed since they were last mirrored, and upserts one row each
 *    (matched by the sheet ID in the tab's first column). Unchanged rows cause no API calls.
 *  - Only entities created/changed on or after SHEET_SYNC_SINCE are considered (so demo/legacy data is never pushed).
 *  - Sheet IDs continue each tab's existing numbering (FDB-00003 after FDB-00002, ...).
 */

const TABLE: Record<EntityType, string> = {
  Package: 'Package', Product: 'Product', PackageBenefit: 'PackageBenefit', Customer: 'Customer', Payment: 'Payment',
  Order: 'Order', OrderItem: 'OrderItem', RewardEntitlement: 'RewardEntitlement', StockMovement: 'StockMovement', AuditLog: 'AuditLog',
};
/** Entity types that have an updatedAt (mutable). Others are append-only: mirrored once. */
const MUTABLE: EntityType[] = ['Package', 'Product', 'PackageBenefit', 'Customer', 'Payment', 'Order', 'RewardEntitlement'];
const LOCK_KEY = 74_201_501; // arbitrary app-wide advisory lock id

export interface SyncReport { skipped?: string; synced: Record<string, number>; errors: string[] }

const hashOf = (values: Values, volatile: string[] = []) =>
  createHash('sha256').update(JSON.stringify(Object.entries(values).filter(([k]) => !volatile.includes(k)).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');

function parseSince(all?: boolean): Date | null {
  if (all) return new Date(0);
  const d = new Date(process.env.SHEET_SYNC_SINCE ?? '');
  return Number.isNaN(d.getTime()) ? null : d;
}

async function candidates(tx: Tx, type: EntityType, since: Date): Promise<Set<string>> {
  const t = Prisma.raw(`"${TABLE[type]}"`);
  const typeLit = Prisma.sql`${type}`;
  // Prisma stores timestamps as UTC without a time zone; compare explicitly in UTC so the server's local zone can't shift the cut-off.
  const cutoff = Prisma.sql`(${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  let rows: { id: string }[];
  if (type === 'OrderItem') return new Set(); // derived from candidate orders
  if (MUTABLE.includes(type)) {
    const created = type === 'PackageBenefit' ? Prisma.sql`FALSE` : Prisma.sql`e."createdAt" >= ${cutoff}`;
    rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT e.id FROM ${t} e LEFT JOIN "SheetRow" r ON r."entityType" = ${typeLit} AND r."entityId" = e.id
      WHERE (r.id IS NULL OR e."updatedAt" > r."syncedAt") AND (${created} OR e."updatedAt" >= ${cutoff})`;
  } else {
    rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT e.id FROM ${t} e LEFT JOIN "SheetRow" r ON r."entityType" = ${typeLit} AND r."entityId" = e.id
      WHERE r.id IS NULL AND e."createdAt" >= ${cutoff}`;
  }
  return new Set(rows.map((r) => r.id));
}

async function unmapped(tx: Tx, type: EntityType, ids: (string | null | undefined)[]): Promise<string[]> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return [];
  const have = new Set((await tx.sheetRow.findMany({ where: { entityType: type, entityId: { in: want } }, select: { entityId: true } })).map((r) => r.entityId));
  return want.filter((i) => !have.has(i));
}

/** A row can only be written once the rows it points at have sheet IDs, so pull those parents into the sweep. */
async function addParents(tx: Tx, c: Map<EntityType, Set<string>>) {
  const add = async (type: EntityType, ids: (string | null | undefined)[]) => { for (const id of await unmapped(tx, type, ids)) c.get(type)!.add(id); };
  const ids = (t: EntityType) => [...c.get(t)!];

  const ents = await tx.rewardEntitlement.findMany({ where: { id: { in: ids('RewardEntitlement') } }, select: { benefitId: true, goal: { select: { customerId: true } } } });
  await add('Customer', ents.map((e) => e.goal.customerId)); await add('PackageBenefit', ents.map((e) => e.benefitId));
  const orders = await tx.order.findMany({ where: { id: { in: ids('Order') } }, select: { customerId: true, items: { select: { productId: true } } } });
  await add('Customer', orders.map((o) => o.customerId)); await add('Product', orders.flatMap((o) => o.items.map((i) => i.productId)));
  const pays = await tx.payment.findMany({ where: { id: { in: ids('Payment') } }, select: { customerId: true } });
  await add('Customer', pays.map((p) => p.customerId));
  const moves = await tx.stockMovement.findMany({ where: { id: { in: ids('StockMovement') } }, select: { productId: true } });
  await add('Product', moves.map((m) => m.productId));
  const bens = await tx.packageBenefit.findMany({ where: { id: { in: ids('PackageBenefit') } }, select: { packageId: true, productId: true } });
  await add('Package', bens.map((b) => b.packageId)); await add('Product', bens.map((b) => b.productId));
  const custs = await tx.customer.findMany({ where: { id: { in: ids('Customer') } }, select: { preferredPackageId: true } });
  await add('Package', custs.map((x) => x.preferredPackageId));
}

function makeCtx(tx: Tx): Ctx {
  const codes = new Map<string, string>();
  const staff = new Map<string, string>();
  return {
    termsVersion: 1,
    code: (type, id) => (id ? codes.get(`${type}:${id}`) ?? '' : ''),
    async preload(type, ids) {
      const want = [...new Set(ids.filter((x): x is string => !!x))].filter((i) => !codes.has(`${type}:${i}`));
      if (!want.length) return;
      for (const r of await tx.sheetRow.findMany({ where: { entityType: type, entityId: { in: want } } })) codes.set(`${type}:${r.entityId}`, r.code);
    },
    async staffEmail(id) {
      if (!id) return '';
      if (!staff.has(id)) staff.set(id, (await tx.staffUser.findUnique({ where: { id }, select: { email: true } }))?.email ?? '');
      return staff.get(id)!;
    },
  };
}

/** Give each entity without a mapping the next sheet ID for its prefix (continuing after whatever is already in the sheet). */
async function assignCodes(tx: Tx, def: TabDef, ids: string[], existingCodes: string[], ctx: Ctx) {
  const missing = await unmapped(tx, def.type, ids);
  if (missing.length) {
    const rx = new RegExp(`^${def.prefix}-(\\d+)$`);
    const inSheet = existingCodes.reduce((m, c) => Math.max(m, Number(rx.exec(c)?.[1] ?? 0)), 0);
    const counter = await tx.sheetCounter.upsert({ where: { prefix: def.prefix }, update: {}, create: { prefix: def.prefix, last: 0 } });
    let n = Math.max(counter.last, inSheet);
    for (const id of missing) {
      n += 1;
      await tx.sheetRow.create({ data: { entityType: def.type, entityId: id, code: `${def.prefix}-${String(n).padStart(def.pad, '0')}`, hash: null, syncedAt: new Date(0) } });
    }
    await tx.sheetCounter.update({ where: { prefix: def.prefix }, data: { last: n } });
  }
  await ctx.preload(def.type, ids);
}

async function syncTab(tx: Tx, def: TabDef, ids: string[], ctx: Ctx, sweepStart: Date): Promise<number> {
  const header = await readHeader(def.tab);
  const idx = new Map(header.map((h, i) => [h.toLowerCase(), i]));
  const missingCols = def.columns.filter((c) => !idx.has(c.toLowerCase()));
  if (missingCols.length) throw new Error(`${def.tab}: sheet is missing column(s) ${missingCols.join(', ')}`);

  const keyIdx = idx.get(def.columns[0].toLowerCase())!;
  const keyCol = await readColumn(def.tab, keyIdx);
  const rowOf = new Map<string, number>();
  keyCol.forEach((v, i) => { if (i > 0 && v) rowOf.set(v.trim(), i + 1); });

  await assignCodes(tx, def, ids, keyCol, ctx);
  const built = await def.build(ids, ctx);
  const marks = new Map((await tx.sheetRow.findMany({ where: { entityType: def.type, entityId: { in: ids } } })).map((r) => [r.entityId, r]));

  const updates: RangeWrite[] = [];
  const appends: Cell[][] = [];
  const done: { id: string; hash: string }[] = [];
  const touched: string[] = [];
  for (const id of ids) {
    const values = built.get(id); const mark = marks.get(id);
    if (!values || !mark) continue;
    const full: Values = { [def.columns[0]]: mark.code, ...values };
    const hash = hashOf(full, def.volatile);
    const row = rowOf.get(mark.code);
    if (row && mark.hash === hash) { touched.push(id); continue; } // already up to date: no API call
    done.push({ id, hash });
    if (row) {
      // update only the cells we own, in contiguous runs, so any extra columns people added to the sheet are left alone
      const cols = def.columns.map((c) => ({ i: idx.get(c.toLowerCase())!, v: full[c] ?? '' })).sort((a, b) => a.i - b.i);
      let run: typeof cols = [];
      const flush = () => { if (run.length) updates.push({ tab: def.tab, startCol: run[0].i, row, values: run.map((r) => r.v) }); run = []; };
      for (const c of cols) { if (run.length && c.i !== run[run.length - 1].i + 1) flush(); run.push(c); }
      flush();
    } else {
      const lower = new Map(Object.entries(full).map(([k, v]) => [k.toLowerCase(), v]));
      appends.push(header.map((h) => lower.get(h.toLowerCase()) ?? ''));
    }
  }
  if (updates.length) await updateRanges(updates);
  if (appends.length) await appendRows(def.tab, appends);

  for (const d of done) await tx.sheetRow.update({ where: { entityType_entityId: { entityType: def.type, entityId: d.id } }, data: { hash: d.hash, syncedAt: sweepStart } });
  if (touched.length) await tx.sheetRow.updateMany({ where: { entityType: def.type, entityId: { in: touched } }, data: { syncedAt: sweepStart } });
  return done.length;
}

export async function runSheetSync(opts: { all?: boolean } = {}): Promise<SyncReport> {
  const report: SyncReport = { synced: {}, errors: [] };
  if (!sheetsEnabled() && !opts.all) return { ...report, skipped: 'not configured' };
  if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) return { ...report, skipped: 'missing GOOGLE_* credentials' };
  const since = parseSince(opts.all);
  if (!since) return { ...report, skipped: 'SHEET_SYNC_SINCE is missing or not a valid date' };

  await db.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
    if (!locked) { report.skipped = 'another sync is running'; return; }

    const sweepStart = new Date();
    const cand = new Map<EntityType, Set<string>>();
    for (const def of TABS) cand.set(def.type, await candidates(tx, def.type, since));
    await addParents(tx, cand);
    // items follow their orders (status changes on the order change every item row)
    const orderIds = [...cand.get('Order')!];
    if (orderIds.length) for (const i of await tx.orderItem.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })) cand.get('OrderItem')!.add(i.id);

    const ctx = makeCtx(tx);
    ctx.termsVersion = Number.parseInt((await tx.setting.findUnique({ where: { id: 1 } }))?.termsVersion ?? '1', 10) || 1;

    for (const def of TABS) { // TABS is in dependency order: parents before children
      const ids = [...cand.get(def.type)!];
      if (!ids.length) continue;
      try {
        for (let i = 0; i < ids.length; i += 300) report.synced[def.tab] = (report.synced[def.tab] ?? 0) + await syncTab(tx, def, ids.slice(i, i + 300), ctx, sweepStart);
      } catch (e) {
        report.errors.push(e instanceof Error ? e.message : String(e)); // leave these rows pending; they're retried next sweep
      }
    }
  }, { timeout: 180_000, maxWait: 5_000 });

  for (const e of report.errors) console.error('[sheet-sync]', e);
  return report;
}

// ---- fire-and-forget trigger used after every successful change in the app ----
let running = false;
let again = false;
export function triggerSheetSync() {
  if (!sheetsEnabled()) return;
  if (running) { again = true; return; } // coalesce: one more pass runs after the current one
  running = true;
  void (async () => {
    try { do { again = false; await runSheetSync(); } while (again); }
    catch (e) { console.error('[sheet-sync] failed:', e instanceof Error ? e.message : e); }
    finally { running = false; }
  })();
}
