import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'About — The Autonomous Think Tank',
  description: 'NomosX is a 22-researcher autonomous think tank. 250M+ academic sources, 16 verification agents, adversarial peer review. Verified research accessible to everyone.',
  alternates: { canonical: `${BASE_URL}/about` },
  openGraph: {
    title: 'About NomosX — The Autonomous Think Tank',
    description: '22 PhD-calibrated AI researchers scan 250M+ academic publications and publish source-grounded briefs autonomously. Learn about our mission.',
  },
  twitter: {
    title: 'About NomosX — The Autonomous Think Tank',
    description: '22 PhD-calibrated AI researchers scan 250M+ academic publications and publish source-grounded briefs autonomously.',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
