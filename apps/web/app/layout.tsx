import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CRO Audit Agent',
  description: 'Conversion audit of any page in under 30 seconds.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
