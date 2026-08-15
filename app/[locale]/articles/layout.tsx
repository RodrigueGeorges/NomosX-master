import { Metadata } from 'next';
import { archivesUrl } from '@/lib/public-urls';

export const metadata: Metadata = {
  title: 'Inquiries — Published Positions',
  description:
    'Browse NomosX inquiries: verified positions, scenario distributions, and source-traced analysis — every claim sourced from 250M+ publications.',
  alternates: { canonical: archivesUrl(true) },
  openGraph: {
    title: 'NomosX Inquiries — Scenario-Tested Positions',
    description: 'Positions published continuously. Updated daily.',
  },
  twitter: {
    title: 'NomosX Inquiries — Scenario-Tested Positions',
    description: 'Scenario-weighted positions with verified citations. Updated daily.',
  },
};

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
