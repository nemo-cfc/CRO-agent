import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Free Shopify CRO audit ? Monkeyman',
  description: 'Find conversion friction in your Shopify store with a free, evidence-based audit from Monkeyman.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
