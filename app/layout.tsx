import React from 'react';
import "./globals.css";
import { Inter, Space_Grotesk, JetBrains_Mono, Cormorant_Garamond } from 'next/font/google';
import { ToastContainer } from '@/components/ui/Toast';
import { AuthProvider } from '@/hooks/useAuth';
import { QueryProvider } from '@/components/providers/QueryProvider';

// Font configuration
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-primary',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-secondary',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: "NomosX — The Agentic Think Tank",
    template: "%s | NomosX"
  },
  description: "Autonomous pipeline for probabilistic foresight: cross-domain mapping, scenario distributions, and institute positions — every claim source-verified.",
  keywords: ["think tank", "agentic AI", "probabilistic foresight", "decision intelligence", "strategic analysis", "scenario planning", "autonomous research"],
  authors: [{ name: "NomosX" }],
  creator: "NomosX",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
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
    siteName: 'NomosX',
    title: 'NomosX — The Agentic Think Tank',
    description: 'Probable futures. Decisions owned. Evidence verified. Cross-domain foresight with probabilistic verdicts.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NomosX — The Agentic Think Tank',
    description: 'Probable futures. Decisions owned. Evidence verified. Cross-domain foresight with probabilistic verdicts.',
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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${cormorant.variable}`} suppressHydrationWarning>
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
