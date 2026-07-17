import { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: 'Pricing — Read Free, Commission on Demand',
  description: 'Free access to every published inquiry. Studio: commission custom studies with foresight and full source traceability — pay per study.',
  alternates: { canonical: `${BASE_URL}/pricing` },
  openGraph: {
    title: 'NomosX Pricing — Access & Studio',
    description: 'Reader: free forever. Studio: custom commissions with foresight and verified citations.',
  },
  twitter: {
    title: 'NomosX Pricing — Access & Studio',
    description: 'Read free. Commission foresight on demand.',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
