import Link from 'next/link';
import { getCatalogue, getPackages, getSettings } from '@/server/queries';
import { naira } from '@/components/ui';
import { OCCASION_LABEL } from '@/lib/validators';
import { optimizedImage } from '@/lib/images';

const STEPS = [
  ['01 / Plan', 'Name your celebration', 'Pick the occasion, the date and a package. We show you exactly how much to save each week or month to be ready on the day.'],
  ['02 / Save', 'Build your drink credit', 'Pay by card or bank transfer whenever you like. Every verified naira becomes a naira of drink credit — no fees, no surprises.'],
  ['03 / Redeem', 'Pour on the big day', 'Choose from the catalogue, reserve your credit and stock, and we deliver. Unlock package perks as your savings grow.'],
];
const FAQ = [
  ['When does my money become drink credit?', 'As soon as a payment is verified — instantly for card payments, and after our team matches the transfer for bank transfers (usually within one business day). ₦1 verified = ₦1 drink credit.'],
  ['Can I change my package?', 'You can upgrade at any time and your credit carries over. Downgrades and refunds are handled by support.'],
  ['What if my event date changes?', 'You can edit the date of any plan in one tap. Your savings schedule updates automatically.'],
  ['Is drink credit refundable?', 'Drink credit is redeemable for catalogue items and is not convertible to cash. See the terms for edge cases and the final redemption deadline.'],
];

export default async function Home() {
  const [packages, products, settings] = await Promise.all([getPackages(), getCatalogue(), getSettings()]);
  return (
    <>
      <section className="wrap grid items-center gap-8 py-12 md:grid-cols-[1.3fr_.7fr] md:py-16">
        <div>
          <div className="eyebrow">A better way to plan your celebrations</div>
          <h1 className="my-4 text-[clamp(40px,6vw,68px)] leading-[1.02] tracking-tight">Save now.<br />Pour later.</h1>
          <p className="max-w-xl text-lg text-muted">{settings.brandMessage}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/register" className="btn">Start planning ↗</Link>
            <Link href="/login" className="btn btn-secondary">I already have an account</Link>
          </div>
          {settings.finalRedemptionDeadline && <p className="mt-4 text-sm text-muted">Final redemption deadline: {settings.finalRedemptionDeadline.toLocaleDateString('en-NG', { dateStyle: 'long' })}</p>}
        </div>
        <div className="relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[28px] bg-hero p-8 text-white">
          <div className="eyebrow !text-accent-light">FYNWYN Group Enterprises</div>
          <div className="font-serif text-[44px] italic leading-tight">Your occasion.<br />Your plan.</div>
          <div className="text-sm text-[#d6d2cd]">Transparent credit · Curated drinks · Reliable fulfilment</div>
          <span aria-hidden className="pointer-events-none absolute -bottom-10 -right-1 font-serif text-[130px] italic text-white/[.07]">FDB</span>
        </div>
      </section>

      <section className="wrap py-8" aria-labelledby="how">
        <div className="eyebrow">How it works</div>
        <h2 id="how" className="mb-5 mt-2 text-3xl">Three steps to a stress-free celebration</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(([k, t, d]) => (
            <div key={k} className="card"><div className="eyebrow">{k}</div><h3 className="mt-2 text-xl">{t}</h3><p className="mt-2 text-muted">{d}</p></div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Occasions we plan for">
          {Object.values(OCCASION_LABEL).map((o) => <span key={o} className="pill">{o}</span>)}
        </div>
      </section>

      <section id="packages" className="wrap scroll-mt-24 py-10" aria-labelledby="pk">
        <div className="eyebrow">Choose your plan</div>
        <h2 id="pk" className="mb-1 mt-2 text-3xl">Drink Bank packages</h2>
        <p className="mb-5 text-muted">Each package has a savings target and perks that unlock as you save.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packages.length === 0 && <div className="card">Packages will be announced soon.</div>}
          {packages.map((p) => (
            <article key={p.id} className={`card flex flex-col ${p.featured ? 'border-accent ring-2 ring-accent/40' : ''}`}>
              <div className="flex items-center justify-between"><span className="pill">{p.name}</span>{p.featured && <span className="text-[11px] font-bold text-accent-text">{p.tagline}</span>}</div>
              {!p.featured && p.tagline && <div className="mt-2 text-xs text-muted">{p.tagline}</div>}
              <div className="my-2 text-3xl font-extrabold">{naira(p.target)}</div>
              <p className="text-sm text-muted">{p.description}</p>
              <ul className="my-4 flex-1 space-y-2 text-sm">
                {p.benefits.map((b) => (
                  <li key={b.id} className="flex gap-2"><span className="text-accent-text" aria-hidden>✓</span><span>{b.title}{b.milestone > 0 && <span className="block text-xs text-muted">at {naira(b.milestone)} saved</span>}</span></li>
                ))}
              </ul>
              <Link href={`/goals/new?package=${p.id}`} className={`btn ${p.featured ? 'btn-accent' : ''}`}>Choose {p.name}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap py-10" aria-labelledby="dr">
        <div className="flex items-end justify-between gap-4">
          <div><div className="eyebrow">Browse before you join</div><h2 id="dr" className="mt-2 text-3xl">Drinks catalogue</h2></div>
          <Link href="/drinks" className="btn btn-secondary btn-sm">See all drinks</Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.slice(0, 4).map((p) => (
            <div key={p.id} className="card flex flex-col gap-1.5">
              {p.imageUrl /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={optimizedImage(p.imageUrl, 400, 224)!} alt={p.name} loading="lazy" className="h-28 w-full rounded-xl object-cover" /> : <div className="grid h-28 place-items-center rounded-xl bg-gradient-to-br from-sunken2 to-sunken text-[11px] tracking-[.16em] text-faint">{p.category.toUpperCase()}</div>}
              <strong>{p.name}</strong>
              <div className="mt-auto text-lg font-extrabold">{naira(p.price)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap py-10" aria-labelledby="faq">
        <h2 id="faq" className="mb-4 text-3xl">Good to know</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {FAQ.map(([q, a]) => <details key={q} className="card group"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-2 text-muted">{a}</p></details>)}
        </div>
      </section>
    </>
  );
}
