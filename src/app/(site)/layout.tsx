import { Footer, Header } from '@/components/SiteChrome';
import { getSettings } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer supportEmail={s.supportEmail} />
    </>
  );
}
