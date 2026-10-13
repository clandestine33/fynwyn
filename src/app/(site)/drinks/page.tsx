import type { Metadata } from 'next';
import { getCatalogue } from '@/server/queries';
import { naira } from '@/components/ui';
import { optimizedImage } from '@/lib/images';

export const metadata: Metadata = { title: 'Drinks catalogue' };

export default async function Drinks() {
  const products = await getCatalogue();
  const cats = [...new Set(products.map((p) => p.category))];
  return (
    <div className="wrap py-10">
      <div className="eyebrow">Browse before you join</div>
      <h1 className="mb-1 mt-2 text-4xl">Drinks catalogue</h1>
      <p className="mb-6 text-muted">Prices and availability can change. Stock is checked again when you redeem.</p>
      {cats.length === 0 && <div className="card">Catalogue items will be added soon.</div>}
      {cats.map((cat) => (
        <section key={cat} className="mb-8" aria-label={cat}>
          <h2 className="mb-3 text-xl">{cat}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {products.filter((p) => p.category === cat).map((p) => (
              <article key={p.id} className="card flex flex-col gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? <img src={optimizedImage(p.imageUrl, 400, 224)!} alt={p.name} loading="lazy" className="h-28 w-full rounded-xl object-cover" /> : <div className="grid h-28 place-items-center rounded-xl bg-gradient-to-br from-sunken2 to-sunken text-[11px] tracking-[.16em] text-faint">{cat.toUpperCase()}</div>}
                <strong>{p.name}</strong>
                {p.description && <p className="text-xs text-muted">{p.description}</p>}
                <div className="mt-auto text-lg font-extrabold">{naira(p.price)}</div>
                <small className="text-muted">{p.available > 0 ? 'Available to order' : 'Currently out of stock'}</small>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
