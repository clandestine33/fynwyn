'use client';
import { useMemo, useState } from 'react';
import { ActionForm, Field, SubmitButton } from './ActionForm';
import { Badge, Table, dateTimeFmt, naira } from './ui';
import { optimizedImage } from '@/lib/images';
import { cancelOrderAction, orderAction, paystackAction, transferAction } from '@/app/actions/customer';
import type { GoalDetail, ProductDTO } from '@/server/queries';

const TABS = [['topup', 'Add money'], ['redeem', 'Redeem drinks'], ['payments', 'Payments'], ['orders', 'Orders'], ['rewards', 'Rewards']] as const;
type Tab = (typeof TABS)[number][0];

export function GoalTabs({ goal, products, paystack, bank, canTransact, initialTab }: {
  goal: GoalDetail; products: ProductDTO[]; paystack: boolean; bank: { name: string; accountName: string; accountNumber: string }; canTransact: boolean; initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'topup');
  const closed = !['ACTIVE', 'COMPLETED'].includes(goal.status);
  return (
    <div>
      <div role="tablist" className="my-5 flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-accent text-onaccent' : 'border border-field bg-soft text-ink'}`}>{label}</button>
        ))}
      </div>
      {!canTransact && !closed && (tab === 'topup' || tab === 'redeem') && <p className="notice notice-err mb-4">Verify your email address to add money or redeem drinks.</p>}

      {tab === 'topup' && <TopUp goal={goal} paystack={paystack} bank={bank} disabled={!canTransact || closed} />}
      {tab === 'redeem' && <Redeem goal={goal} products={products} disabled={!canTransact || closed} />}

      {tab === 'payments' && (
        <Table head={['Date', 'Amount', 'Method', 'Reference', 'Status']} empty="No payments yet.">
          {goal.payments.map((p) => (
            <tr key={p.id}><td className="td">{dateTimeFmt(p.createdAt)}</td><td className="td font-semibold">{naira(p.amount)}</td><td className="td">{p.method === 'PAYSTACK' ? 'Card / online' : 'Bank transfer'}</td><td className="td font-mono text-xs">{p.reference}</td>
              <td className="td"><Badge status={p.status} />{p.rejectReason && <div className="mt-1 text-xs text-muted">{p.rejectReason}</div>}</td></tr>
          ))}
        </Table>
      )}

      {tab === 'orders' && (
        <Table head={['Order', 'Placed', 'Items', 'Total', 'Status', '']} empty="No orders yet.">
          {goal.orders.map((o) => (
            <tr key={o.id}><td className="td font-mono text-xs">{o.number}</td><td className="td">{dateTimeFmt(o.createdAt)}</td><td className="td">{o.items.join(', ')}</td><td className="td font-semibold">{naira(o.total)}</td>
              <td className="td"><Badge status={o.status} />{o.cancelReason && <div className="mt-1 text-xs text-muted">{o.cancelReason}</div>}</td>
              <td className="td">{o.status === 'PENDING_APPROVAL' && <ActionForm action={cancelOrderAction} confirm="Cancel this order and release your credit?"><input type="hidden" name="orderId" value={o.id} /><SubmitButton className="btn btn-secondary btn-sm">Cancel</SubmitButton></ActionForm>}</td></tr>
          ))}
        </Table>
      )}

      {tab === 'rewards' && (
        <Table head={['Reward', 'Qty', 'Status']} empty="Rewards unlock as you reach package milestones.">
          {goal.rewards.map((r) => <tr key={r.id}><td className="td">{r.title}</td><td className="td">{r.quantity}</td><td className="td"><Badge status={r.status} /></td></tr>)}
        </Table>
      )}
    </div>
  );
}

function TopUp({ goal, paystack, bank, disabled }: { goal: GoalDetail; paystack: boolean; bank: { name: string; accountName: string; accountNumber: string }; disabled: boolean }) {
  const [amount, setAmount] = useState('');
  const suggestions = [goal.plan.perMonth, goal.plan.perWeek, 50_000, 100_000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {paystack && (
        <div className="card">
          <h3 className="text-xl">Pay online</h3>
          <p className="mt-1 text-sm text-muted">Card, bank or USSD via Paystack. Credit is added automatically as soon as payment succeeds.</p>
          <ActionForm action={paystackAction} resetOnSuccess={false}>
            <input type="hidden" name="goalId" value={goal.id} />
            <Field label="Amount (₦)" name="amount" type="number" min={100} step={1} required value={amount} onChange={(e) => setAmount(e.target.value)} disabled={disabled} />
            <div className="mt-2 flex flex-wrap gap-2">{suggestions.map((s) => <button type="button" key={s} onClick={() => setAmount(String(s))} className="pill hover:bg-soft-hover">{naira(s)}</button>)}</div>
            <div className="mt-5"><SubmitButton pendingText="Redirecting…" className="btn">Continue to payment</SubmitButton></div>
          </ActionForm>
        </div>
      )}
      <div className="card">
        <h3 className="text-xl">Bank transfer</h3>
        <p className="mt-1 text-sm text-muted">Transfer first, then submit the reference. Credit is added once our team verifies it.</p>
        <div className="my-3 rounded-xl bg-tint p-3 text-sm">
          <div><span className="text-muted">Bank:</span> <strong>{bank.name}</strong></div>
          <div><span className="text-muted">Account name:</span> <strong>{bank.accountName}</strong></div>
          <div><span className="text-muted">Account number:</span> <strong className="font-mono">{bank.accountNumber}</strong></div>
        </div>
        <ActionForm action={transferAction}>
          <input type="hidden" name="goalId" value={goal.id} />
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Amount sent (₦)" name="amount" type="number" min={100} step={1} required disabled={disabled} />
            <Field label="Transfer reference / session ID" name="reference" required disabled={disabled} />
          </div>
          <Field label="Receipt link (optional)" name="proofUrl" type="url" placeholder="https://…" disabled={disabled} />
          <div className="mt-5"><SubmitButton className="btn btn-secondary">Submit for verification</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}

function Redeem({ goal, products, disabled }: { goal: GoalDetail; products: ProductDTO[]; disabled: boolean }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const total = useMemo(() => products.reduce((a, p) => a + p.price * (qty[p.id] ?? 0), 0), [products, qty]);
  const items = JSON.stringify(Object.entries(qty).filter(([, q]) => q > 0).map(([productId, quantity]) => ({ productId, quantity })));
  const over = total > goal.balances.available;
  return (
    <div className="card">
      <h3 className="text-xl">Build a redemption order</h3>
      <p className="mt-1 text-sm text-muted">Available credit: <strong>{naira(goal.balances.available)}</strong>. Credit and stock are reserved when you submit; staff approve before dispatch.</p>
      <ActionForm action={orderAction} resetOnSuccess>
        <input type="hidden" name="goalId" value={goal.id} />
        <input type="hidden" name="items" value={items} />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => (
            <div key={p.id} className="rounded-2xl border border-line p-3">
              {p.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={optimizedImage(p.imageUrl, 300, 160)!} alt="" loading="lazy" className="mb-2 h-20 w-full rounded-lg object-cover" />}
              <strong className="text-sm">{p.name}</strong>
              <div className="text-xs text-muted">{naira(p.price)} · {p.available} left</div>
              <label htmlFor={`q-${p.id}`} className="sr-only">Quantity of {p.name}</label>
              <input id={`q-${p.id}`} type="number" min={0} max={p.available} value={qty[p.id] ?? 0} disabled={disabled || p.available < 1}
                onChange={(e) => setQty({ ...qty, [p.id]: Math.max(0, Math.min(p.available, Math.floor(Number(e.target.value) || 0))) })} className="input mt-2" />
            </div>
          ))}
        </div>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Preferred delivery date" name="deliveryDate" type="date" />
          <Field label="Delivery phone" name="deliveryPhone" type="tel" required />
          <div className="sm:col-span-2"><label htmlFor="deliveryAddress" className="label">Delivery address</label><textarea id="deliveryAddress" name="deliveryAddress" rows={2} required minLength={8} className="input" /></div>
          <div className="sm:col-span-2"><label htmlFor="deliveryNote" className="label">Delivery instructions (optional)</label><textarea id="deliveryNote" name="deliveryNote" rows={2} className="input" /></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div><span className="text-muted">Order total </span><strong className="text-xl">{naira(total)}</strong>{over && <span className="ml-2 text-sm text-danger-text">exceeds your available credit</span>}</div>
          <SubmitButton pendingText="Reserving…">Reserve credit &amp; stock</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
