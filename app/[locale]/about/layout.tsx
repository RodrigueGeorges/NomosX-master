import { Metadata } from 'next';
import {
  BRAND_DESCRIPTION,
  BRAND_EMAIL_TAGLINE,
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_TITLE,
} from '@/lib/brand/public-copy';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

export const metadata: Metadata = {
  title: `About — ${BRAND_EMAIL_TAGLINE}`,
  description: BRAND_DESCRIPTION,
  alternates: { canonical: `${BASE_URL}/about` },
  openGraph: {
    title: `About ${BRAND_TITLE}`,
    description: `${BRAND_TAGLINE} Learn about our mission.`,
  },
  twitter: {
    title: `About ${BRAND_TITLE}`,
    description: BRAND_TAGLINE,
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
