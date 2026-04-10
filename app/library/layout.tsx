import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Library — Your Research Archive',
  description: 'Access your saved articles, briefs, and research documents in your personal NomosX library.',
  alternates: { canonical: `${BASE_URL}/library` },
  robots: { index: false, follow: false },
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
