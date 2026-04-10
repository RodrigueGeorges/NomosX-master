import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Search — Explore 250M+ Academic Sources',
  description: 'Search verified academic sources across OpenAlex, CrossRef, Semantic Scholar and more. Filter by domain, quality, novelty, and recency.',
  alternates: { canonical: `${BASE_URL}/search` },
  openGraph: {
    title: 'NomosX Search — Explore 250M+ Academic Sources',
    description: 'Search verified academic sources. Filter by domain, quality, novelty, and recency. Powered by 22 AI researchers.',
  },
  twitter: {
    title: 'NomosX Search — Explore 250M+ Academic Sources',
    description: 'Search verified academic sources. Filter by domain, quality, novelty, and recency.',
  },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
