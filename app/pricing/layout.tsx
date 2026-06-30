import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Pricing — Read Free, Commission on Demand',
  description: 'Free access to agentic think tank inquiries. Studio: commission custom studies with probabilistic foresight and full source traceability — pay per study.',
  alternates: { canonical: `${BASE_URL}/pricing` },
  openGraph: {
    title: 'NomosX Pricing — Agentic Think Tank Access',
    description: 'Reader: free forever. Studio: custom commissions with prospective distributions and verified citations.',
  },
  twitter: {
    title: 'NomosX Pricing — Agentic Think Tank Access',
    description: 'Read free. Commission probabilistic foresight on demand.',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
