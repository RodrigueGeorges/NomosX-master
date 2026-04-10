import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Methodology — 16-Agent Verification Pipeline',
  description: 'How NomosX works: 16 specialized agents verify every claim through adversarial debate, meta-analysis, and citation verification. From 250M+ raw sources to verified intelligence.',
  alternates: { canonical: `${BASE_URL}/methodology` },
  openGraph: {
    title: 'NomosX Methodology — 16-Agent Verification Pipeline',
    description: 'SCOUT → INDEX → RANK → READER → ANALYST → COUNCIL → DEBATE → META-ANALYSIS → PUBLISH. Every claim verified.',
  },
  twitter: {
    title: 'NomosX Methodology — 16-Agent Verification Pipeline',
    description: 'SCOUT → INDEX → RANK → READER → ANALYST → COUNCIL → DEBATE → META-ANALYSIS → PUBLISH.',
  },
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
