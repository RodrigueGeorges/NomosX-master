import { Metadata } from 'next';
import { archivesUrl } from '@/lib/public-urls';

export const metadata: Metadata = {
  title: 'Inquiries — Agentic Think Tank Archives',
  description:
    'Browse NomosX inquiries: probabilistic verdicts, prospective distributions, and institute positions — every claim sourced from 250M+ publications.',
  alternates: { canonical: archivesUrl(true) },
  openGraph: {
    title: 'NomosX Inquiries — Probabilistic Foresight',
    description: 'Institute positions published autonomously by the agentic think tank. Updated daily.',
  },
  twitter: {
    title: 'NomosX Inquiries — Probabilistic Foresight',
    description: 'Cross-domain foresight with verified citations. Updated daily.',
  },
};

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
