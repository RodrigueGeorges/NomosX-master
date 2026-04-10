import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Researchers — 22 PhD-Calibrated AI Researchers',
  description: 'Meet the 22 specialized AI researchers of the NomosX Research Council. Spanning economics, geopolitics, technology, health, and complexity science.',
  alternates: { canonical: `${BASE_URL}/researchers` },
  openGraph: {
    title: 'NomosX Researchers — 22 PhD-Calibrated AI Researchers',
    description: '22 specialized AI researchers spanning economics, geopolitics, technology, health, and complexity science.',
  },
  twitter: {
    title: 'NomosX Researchers — 22 PhD-Calibrated AI Researchers',
    description: '22 specialized AI researchers spanning economics, geopolitics, technology, health, and complexity science.',
  },
};

export default function ResearchersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
