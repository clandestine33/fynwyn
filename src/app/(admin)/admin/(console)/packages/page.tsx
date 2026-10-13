import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { toNaira } from '@/lib/money';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { Badge, naira } from '@/components/ui';
import { saveBenefitAction, savePackageAction } from '../../actions';
import { can, pageGuard } from '../guard';

export const metadata: Metadata = { title: 'Packages' };

const YesNo = ({ name, value, label }: { name: string; value: boolean; label: string }) => (
  <div><label className="label" htmlFor={name}>{label}</label><select id={name} name={name} defaultValue={String(value)} className="input"><option value="true">Yes</option><option value="false">No</option></select></div>
);

export default async function Packages() {
  const s = await pageGuard('OPERATIONS', 'FINANCE');
  const edit = can(s.role); // SUPER_ADMIN only
  const [packages, products] = await Promise.all([
    db.package.findMany({ orderBy: { sortOrder: 'asc' }, include: { benefits: { orderBy: { milestoneAmount: 'asc' } }, _count: { select: { goals: true } } } }),
    db.product.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return (
    <div>
      <h1 className="mb-1 text-3xl">Packages &amp; benefits</h1>
      <p className="mb-5 text-sm text-muted">Changing a package target never alters existing customer plans (they keep the target they signed up with). New or edited benefits are re-evaluated for current plans immediately.{!edit && ' Only super admins can edit.'}</p>
      <div className="space-y-4">
        {packages.map((p) => (
          <section key={p.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="text-2xl">{p.name} <Badge status={p.active ? 'ACTIVE' : 'CLOSED'} label={p.active ? 'Active' : 'Inactive'} /></h2><p className="text-sm text-muted">{naira(toNaira(p.targetAmount))} target · {p._count.goals} plan(s) · /{p.slug}</p></div>
            </div>
            <ul className="mt-3 divide-y divide-line text-sm">
              {p.benefits.map((b) => (
                <li key={b.id} className="py-2">
                  {edit ? (
                    <details><summary className="cursor-pointer">{b.title} <span className="text-muted">· {b.milestoneAmount === 0n ? 'included' : `at ${naira(toNaira(b.milestoneAmount))}`}{b.active ? '' : ' · inactive'}</span></summary>
                      <BenefitForm packageId={p.id} products={products} b={{ id: b.id, title: b.title, description: b.description, milestone: toNaira(b.milestoneAmount), productId: b.productId, quantity: b.quantity, active: b.active }} />
                    </details>
                  ) : <span>{b.title} <span className="text-muted">· {b.milestoneAmount === 0n ? 'included' : `at ${naira(toNaira(b.milestoneAmount))}`}</span></span>}
                </li>
              ))}
            </ul>
            {edit && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <details className="rounded-xl bg-tint p-3"><summary className="cursor-pointer text-sm font-semibold">Add benefit</summary><BenefitForm packageId={p.id} products={products} /></details>
                <details className="rounded-xl bg-tint p-3"><summary className="cursor-pointer text-sm font-semibold">Edit package</summary>
                  <PackageForm p={{ id: p.id, name: p.name, slug: p.slug, tagline: p.tagline, description: p.description, target: toNaira(p.targetAmount), sortOrder: p.sortOrder, featured: p.featured, active: p.active }} />
                </details>
              </div>
            )}
          </section>
        ))}
      </div>
      {edit && <div className="card mt-6"><h2 className="text-xl">New package</h2><PackageForm /></div>}
    </div>
  );
}

function PackageForm({ p }: { p?: { id: string; name: string; slug: string; tagline: string | null; description: string | null; target: number; sortOrder: number; featured: boolean; active: boolean } }) {
  return (
    <ActionForm action={savePackageAction} resetOnSuccess={!p} className="grid gap-x-3 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Name" name="name" defaultValue={p?.name} required /><Field label="Slug" name="slug" defaultValue={p?.slug} required placeholder="e.g. toast" />
      <Field label="Target (₦)" name="targetAmount" type="number" min={1000} step="1" defaultValue={p?.target} required /><Field label="Sort order" name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 10} />
      <Field label="Tagline" name="tagline" defaultValue={p?.tagline ?? ''} /><Field label="Description" name="description" defaultValue={p?.description ?? ''} />
      <YesNo name="featured" value={p?.featured ?? false} label="Featured?" /><YesNo name="active" value={p?.active ?? true} label="Active?" />
      <div className="sm:col-span-2 mt-4"><SubmitButton className="btn btn-secondary btn-sm">{p ? 'Save package' : 'Create package'}</SubmitButton></div>
    </ActionForm>
  );
}

function BenefitForm({ packageId, products, b }: { packageId: string; products: { id: string; name: string }[]; b?: { id: string; title: string; description: string | null; milestone: number; productId: string | null; quantity: number; active: boolean } }) {
  return (
    <ActionForm action={saveBenefitAction} resetOnSuccess={!b} className="grid gap-x-3 sm:grid-cols-2">
      <input type="hidden" name="packageId" value={packageId} />{b && <input type="hidden" name="id" value={b.id} />}
      <Field label="Title" name="title" defaultValue={b?.title} required /><Field label="Unlocks at (₦ saved, 0 = included)" name="milestoneAmount" type="number" min={0} step="1" defaultValue={b?.milestone ?? 0} required />
      <Field label="Description" name="description" defaultValue={b?.description ?? ''} />
      <div><label className="label" htmlFor={`pr${b?.id ?? 'n' + packageId}`}>Reward product (optional)</label><select id={`pr${b?.id ?? 'n' + packageId}`} name="productId" defaultValue={b?.productId ?? ''} className="input"><option value="">— none —</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <Field label="Quantity" name="quantity" type="number" min={1} defaultValue={b?.quantity ?? 1} /><YesNo name="active" value={b?.active ?? true} label="Active?" />
      <div className="sm:col-span-2 mt-4"><SubmitButton className="btn btn-secondary btn-sm">{b ? 'Save benefit' : 'Add benefit'}</SubmitButton></div>
    </ActionForm>
  );
}
