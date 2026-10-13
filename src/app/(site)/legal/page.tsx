import type { Metadata } from 'next';
import { getSettings } from '@/server/queries';

export const metadata: Metadata = { title: 'Terms & privacy' };

export default async function Legal() {
  const s = await getSettings();
  return (
    <div className="wrap max-w-3xl py-10">
      <h1 className="mb-6 text-4xl">Terms &amp; privacy</h1>
      <section className="card mb-4"><h2 className="mb-2 text-2xl">Campaign terms <span className="text-sm font-sans text-muted">(v{s.termsVersion})</span></h2><p className="whitespace-pre-line text-muted">{s.termsText}</p></section>
      <section className="card mb-4"><h2 className="mb-2 text-2xl">Privacy</h2><p className="whitespace-pre-line text-muted">{s.privacyText}</p></section>
      {s.supportEmail && <p className="text-muted">Questions? <a className="underline" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a></p>}
    </div>
  );
}
