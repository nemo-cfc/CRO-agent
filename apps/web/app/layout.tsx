import type { Metadata } from 'next';
import { Bricolage_Grotesque, Geist_Mono, Hanken_Grotesk, Newsreader } from 'next/font/google';
import './globals.css';
import './brand.css';

// The monkeyman.agency type system; brand.css reads these variables.
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-hanken', display: 'swap' });
const newsreader = Newsreader({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['italic'], variable: '--font-newsreader', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Free Shopify CRO audit ? Monkeyman',
  description: 'Find conversion friction in your Shopify store with a free, evidence-based audit from Monkeyman.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${hanken.variable} ${newsreader.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
