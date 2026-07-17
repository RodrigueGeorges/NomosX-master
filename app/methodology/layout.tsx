import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Methodology — Map, Confront, Quantify, Decide',
  description: 'How NomosX works: cross-domain mapping, adversarial confrontation, multi-scenario quantification, and published positions — every claim source-verified from 250M+ sources.',
  alternates: { canonical: `${BASE_URL}/methodology` },
  openGraph: {
    title: 'NomosX Methodology — From Question to Position',
    description: 'Four public stages. One verification protocol. Positions with full [SRC-N] traceability.',
  },
  twitter: {
    title: 'NomosX Methodology — From Question to Position',
    description: 'Map → confront → quantify → decide. Evidence-bound positions.',
  },
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
