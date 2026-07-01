import React from 'react';
import "./globals.css";
import { Barlow, Barlow_Semi_Condensed, JetBrains_Mono } from 'next/font/google';
import { ToastContainer } from '@/components/ui/Toast';
import { AuthProvider } from '@/hooks/useAuth';
import { QueryProvider } from '@/components/providers/QueryProvider';
import {
  BRAND_DESCRIPTION,
  BRAND_NAME,
  BRAND_OG_DESCRIPTION,
  BRAND_TITLE,
} from '@/lib/brand/public-copy';

// Font configuration
/** Barlow ≈ D-DIN (géométrique/grotesque libre — grammaire SpaceX) */
const barlow = Barlow({
  subsets: ['latin'],
  variable: '--font-primary',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

/** Barlow Semi Condensed — titres hero uppercase (D-DIN-Bold) */
const barlowCondensed = Barlow_Semi_Condensed({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: BRAND_TITLE,
    template: `%s | ${BRAND_NAME}`,
  },
  description: BRAND_DESCRIPTION,
  keywords: ["think tank", "agentic AI", "probabilistic foresight", "decision intelligence", "strategic analysis", "scenario planning", "autonomous research"],
  authors: [{ name: BRAND_NAME }],
  creator: BRAND_NAME,
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    types: {
      'application/rss+xml': '/feed.xml',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: BRAND_NAME,
    title: BRAND_TITLE,
    description: BRAND_OG_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_TITLE,
    description: BRAND_OG_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NomosX',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com',
    logo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com'}/favicon.svg`,
    description: 'The agentic think tank for probable futures — autonomous cross-domain mapping, probabilistic foresight, and source-verified institute positions.',
    sameAs: [
      'https://x.com/nomosx_ai',
      'https://github.com/nomosx',
    ],
    foundingDate: '2024',
    knowsAbout: [
      'Strategic Analysis', 'Probabilistic Foresight', 'Decision Intelligence',
      'Agentic Research', 'AI Think Tank', 'Evidence-Based Policy',
    ],
  };

  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-primary">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:text-sm focus:font-mono focus:uppercase focus:tracking-wider">
          Skip to main content
        </a>
        <QueryProvider>
          <AuthProvider>
            <div id="main-content">{children}</div>
            <ToastContainer />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
