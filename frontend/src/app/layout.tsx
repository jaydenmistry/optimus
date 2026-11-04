import './globals.css';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { themeInitScript } from '@/lib/theme';
import { Providers } from '@/components/shell/providers';
import { Footer, NavBar, TabBar } from '@/components/shell/nav';
import { DemoBanner } from '@/components/simulation/banner';

export const metadata: Metadata = {
  title: {
    default: 'Optimus',
    template: '%s · Optimus',
  },
  description: 'Predict stockouts, detect inventory anomalies and balance stock across stores.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by src/proxy.ts; lets the inline theme script pass the CSP
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-float"
          >
            Skip to content
          </a>
          <NavBar />
          <DemoBanner />
          <main id="main" className="min-h-[calc(100vh-3.5rem)]">
            {children}
          </main>
          <Footer />
          <TabBar />
        </Providers>
      </body>
    </html>
  );
}
