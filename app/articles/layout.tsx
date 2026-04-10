import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Publications — Auto-Published Strategic Research',
  description: 'Browse executive briefs and strategic reports published autonomously by NomosX. Every claim sourced from 250M+ academic publications. Updated daily.',
  alternates: { canonical: `${BASE_URL}/articles` },
  openGraph: {
    title: 'NomosX Publications — Autonomous Strategic Research',
    description: 'Executive briefs and strategic reports, published autonomously by 22 AI researchers. Updated daily.',
  },
  twitter: {
    title: 'NomosX Publications — Autonomous Strategic Research',
    description: 'Executive briefs and strategic reports, published autonomously by 22 AI researchers.',
  },
};

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
