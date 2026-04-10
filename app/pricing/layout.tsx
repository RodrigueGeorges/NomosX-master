import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Pricing — Verified Intelligence for Every Budget',
  description: 'Start free. Access verified research from 250M+ academic sources, reviewed by 22 AI researchers. Analyst (€0), Researcher (€19/mo), Studio (€49/mo).',
  alternates: { canonical: `${BASE_URL}/pricing` },
  openGraph: {
    title: 'NomosX Pricing — From Free to Full Strategic Intelligence',
    description: 'Analyst: Free weekly dispatch. Researcher: Commission briefs. Studio: Full editorial control. All plans include 22-researcher verification.',
  },
  twitter: {
    title: 'NomosX Pricing — From Free to Full Strategic Intelligence',
    description: 'Analyst: Free. Researcher: €19/mo. Studio: €49/mo. All include 22-researcher verification pipeline.',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
