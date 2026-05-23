import { Metadata } from 'next';
import { archivesUrl } from '@/lib/public-urls';

export const metadata: Metadata = {
  title: 'Inquiries — Auto-Published Research',
  description:
    'Browse open NomosX inquiries across signals, memos, briefs, reports, and dossiers. Every claim sourced from 250M+ academic publications. Updated daily.',
  alternates: { canonical: archivesUrl(true) },
  openGraph: {
    title: 'NomosX Inquiries — Autonomous Strategic Research',
    description: 'Open research formats published autonomously by 22 AI researchers. Updated daily.',
  },
  twitter: {
    title: 'NomosX Inquiries — Autonomous Strategic Research',
    description: 'Open research formats published autonomously by 22 AI researchers.',
  },
};

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
