import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Methodology — Map, Confront, Quantify, Decide',
  description: 'How NomosX works: cross-domain mapping, adversarial confrontation, probabilistic quantification, and institute positions — every claim source-verified from 250M+ sources.',
  alternates: { canonical: `${BASE_URL}/methodology` },
  openGraph: {
    title: 'NomosX Methodology — Agentic Prospective Pipeline',
    description: 'Four public stages. One agentic pipeline. Probable futures with full [SRC-N] traceability.',
  },
  twitter: {
    title: 'NomosX Methodology — Agentic Prospective Pipeline',
    description: 'Map → confront → quantify → decide. Evidence-bound institute positions.',
  },
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
