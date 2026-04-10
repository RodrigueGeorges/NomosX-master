import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Signals — Weak Signal Radar',
  description: 'Monitor emerging weak signals across economics, geopolitics, technology, and more. Early detection of strategic shifts before they become mainstream.',
  alternates: { canonical: `${BASE_URL}/signals` },
  openGraph: {
    title: 'NomosX Signals — Weak Signal Radar',
    description: 'Monitor emerging weak signals across economics, geopolitics, technology, and more.',
  },
};

export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
