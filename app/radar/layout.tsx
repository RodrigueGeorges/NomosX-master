import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Radar — Weak-Signal Intelligence Monitor',
  description: 'Monitor emerging, trending, and critical weak signals across technology, policy, geopolitics, and markets. Real-time radar powered by 22 AI researchers.',
  alternates: { canonical: `${BASE_URL}/radar` },
  openGraph: {
    title: 'NomosX Radar — Weak-Signal Intelligence Monitor',
    description: 'Monitor emerging, trending, and critical weak signals across technology, policy, geopolitics, and markets.',
  },
  twitter: {
    title: 'NomosX Radar — Weak-Signal Intelligence Monitor',
    description: 'Monitor emerging, trending, and critical weak signals across technology, policy, geopolitics, and markets.',
  },
};

export default function RadarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
