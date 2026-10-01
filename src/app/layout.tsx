import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Crypto Portfolio Optimizer',
  description: 'Production-ready crypto portfolio optimizer using live market data and Modern Portfolio Theory.',
  applicationName: 'Crypto Portfolio Optimizer',
  keywords: ['crypto', 'portfolio', 'optimizer', 'MPT', 'Next.js'],
  robots: { index: true, follow: true }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark light',
  themeColor: '#080b18'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
