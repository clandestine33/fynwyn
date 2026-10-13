import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'FYNWYN Drink Bank — Save now. Pour later.', template: '%s · FYNWYN Drink Bank' },
  description: 'Plan your celebration, save toward it in your own time, and redeem premium drinks when the day arrives.',
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  openGraph: { siteName: 'FYNWYN Drink Bank', type: 'website' },
  icons: { icon: [{ url: '/icon-light.png', media: '(prefers-color-scheme: light)' }, { url: '/icon-dark.png', media: '(prefers-color-scheme: dark)' }] },
};
export const viewport: Viewport = { themeColor: '#111111', width: 'device-width', initialScale: 1 };

// Runs before first paint so the page never flashes the wrong theme.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('fdb-theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light'}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>{children}</body>
    </html>
  );
}
