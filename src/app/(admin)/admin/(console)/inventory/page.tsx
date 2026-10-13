import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { toNaira } from '@/lib/money';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { Badge, Table, dateTimeFmt, naira } from '@/components/ui';
import { imageUploadTicketAction, saveProductAction, stockAction } from '../../actions';
import { ImageUpload } from '@/components/ImageUpload';
import { cloudinaryEnabled } from '@/lib/cloudinary';
import { optimizedImage } from '@/lib/images';
import { pageGuard } from '../guard';

export const metadata: Metadata = { title: 'Inventory' };

function ProductForm({ p }: { p?: { id: string; name: string; category: string; sku: string | null; description: string | null; imageUrl: string | null; unitPrice: number; unitCost: number; active: boolean } }) {
  return (
    <ActionForm action={saveProductAction} resetOnSuccess={!p} className="grid gap-x-3 sm:grid-cols-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Name" name="name" defaultValue={p?.name} required />
      <Field label="Category" name="category" defaultValue={p?.category ?? 'Beverage'} required />
      <Field label="SKU" name="sku" defaultValue={p?.sku ?? ''} />
      <Field label="Unit price (₦)" name="unitPrice" type="number" min={0} step="1" defaultValue={p?.unitPrice} required />
      <Field label="Unit cost (₦)" name="unitCost" type="number" min={0} step="1" defaultValue={p?.unitCost ?? 0} />
      <div className="sm:col-span-3"><ImageUpload initial={p?.imageUrl} getTicket={imageUploadTicketAction} enabled={cloudinaryEnabled()} /></div>
      <div className="sm:col-span-2"><label htmlFor={`d${p?.id}`} className="label">Description</label><input id={`d${p?.id}`} name="description" defaultValue={p?.description ?? ''} className="input" /></div>
      <div><label className="label" htmlFor={`a${p?.id}`}>Visible to customers?</label><select id={`a${p?.id}`} name="active" defaultValue={String(p?.active ?? true)} className="input"><option value="true">Active</option><option value="false">Hidden</option></select></div>
      <div className="sm:col-span-3 mt-4"><SubmitButton className="btn btn-secondary btn-sm">{p ? 'Save product' : 'Add product'}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function Inventory() {
  await pageGuard('OPERATIONS');
  const [products, moves] = await Promise.all([
    db.product.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
    db.stockMovement.findMany({ orderBy: { createdAt: 'desc' }, take: 15, include: { product: { select: { name: true } } } }),
  ]);
  return (
    <div>
      <h1 className="mb-4 text-3xl">Inventory &amp; catalogue</h1>
      <Table head={['Product', 'Price', 'On hand', 'Reserved', 'Available', 'Status']} empty="No products yet.">
        {products.map((p) => (
          <tr key={p.id}><td className="td"><div className="flex items-center gap-3">{/* eslint-disable-next-line @next/next/no-img-element */}{p.imageUrl ? <img src={optimizedImage(p.imageUrl, 80, 80)!} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-sunken text-[8px] text-faint">N/A</span>}<div><strong>{p.name}</strong><div className="text-xs text-muted">{p.category}{p.sku ? ` · ${p.sku}` : ''}</div></div></div></td><td className="td">{naira(toNaira(p.unitPrice))}</td><td className="td">{p.onHand}</td><td className="td">{p.reserved}</td>
            <td className={`td font-semibold ${p.onHand - p.reserved <= 10 ? 'text-danger-text' : ''}`}>{p.onHand - p.reserved}</td><td className="td"><Badge status={p.active ? 'ACTIVE' : 'CLOSED'} label={p.active ? 'Active' : 'Hidden'} /></td></tr>
        ))}
      </Table>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-xl">Record stock movement</h2>
          <ActionForm action={stockAction}>
            <label htmlFor="productId" className="label">Product</label>
            <select id="productId" name="productId" className="input">{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <Field label="Quantity change (+ receive, − write-off)" name="quantity" type="number" step="1" required />
            <Field label="Reference" name="reference" /><Field label="Notes" name="note" />
            <div className="mt-4"><SubmitButton className="btn btn-secondary btn-sm">Save movement</SubmitButton></div>
          </ActionForm>
        </div>
        <div className="card"><h2 className="text-xl">Recent movements</h2>
          <ul className="mt-2 space-y-1.5 text-sm">{moves.map((m) => <li key={m.id}><strong>{m.quantity > 0 ? '+' : ''}{m.quantity}</strong> {m.product.name} <span className="text-muted">· {m.type.toLowerCase()} · {dateTimeFmt(m.createdAt)}</span></li>)}{moves.length === 0 && <li className="text-muted">None yet.</li>}</ul>
        </div>
      </div>
      <div className="card mt-4"><h2 className="text-xl">Add a product</h2><ProductForm /></div>
      <h2 className="mb-3 mt-8 text-xl">Edit products</h2>
      <div className="space-y-2">
        {products.map((p) => (
          <details key={p.id} className="card !p-4"><summary className="cursor-pointer font-semibold">{p.name}</summary>
            <ProductForm p={{ id: p.id, name: p.name, category: p.category, sku: p.sku, description: p.description, imageUrl: p.imageUrl, unitPrice: toNaira(p.unitPrice), unitCost: toNaira(p.unitCost), active: p.active }} />
          </details>
        ))}
      </div>
    </div>
  );
}
