import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'About — The Agentic Think Tank',
  description: 'NomosX is an agentic think tank for probabilistic foresight. Cross-domain mapping, scenario distributions, and institute positions — verified from 250M+ sources.',
  alternates: { canonical: `${BASE_URL}/about` },
  openGraph: {
    title: 'About NomosX — The Agentic Think Tank',
    description: 'Probable futures. Decisions owned. Evidence verified. Learn about our mission.',
  },
  twitter: {
    title: 'About NomosX — The Agentic Think Tank',
    description: 'Probable futures. Decisions owned. Evidence verified.',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
