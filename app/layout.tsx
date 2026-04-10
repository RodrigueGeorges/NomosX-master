import React from 'react';
import "./globals.css";
import { Inter,Space_Grotesk,JetBrains_Mono } from 'next/font/google';
import { ToastContainer } from '@/components/ui/Toast';
import { AuthProvider } from '@/hooks/useAuth';
import { QueryProvider } from '@/components/providers/QueryProvider';

// Font configuration
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-primary',
  weight: ['300', '400', '500', '600', '700', '800', '900'],
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

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: "NomosX — The Autonomous Think Tank",
    template: "%s | NomosX"
  },
  description: "22 PhD-calibrated AI researchers continuously scan 250M+ academic publications and publish source-grounded briefs autonomously — no human trigger required.",
  keywords: ["think tank", "AI", "artificial intelligence", "academic research", "strategic analysis", "decision intelligence", "autonomous research"],
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
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'NomosX',
    title: 'NomosX — The Autonomous Think Tank',
    description: '22 PhD-calibrated AI researchers scan 250M+ academic publications and publish source-grounded briefs autonomously.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NomosX — The Autonomous Think Tank',
    description: '22 PhD-calibrated AI researchers scan 250M+ academic publications and publish source-grounded briefs autonomously.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NomosX',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com',
    logo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com'}/favicon.svg`,
    description: '22 PhD-calibrated AI researchers continuously scan 250M+ academic publications and publish source-grounded briefs autonomously.',
    sameAs: [
      'https://x.com/nomosx_ai',
      'https://github.com/nomosx',
    ],
    foundingDate: '2024',
    knowsAbout: [
      'Strategic Analysis', 'Academic Research', 'Decision Intelligence',
      'Autonomous Research', 'AI Think Tank', 'Evidence-Based Policy',
    ],
  };

  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-primary">
        <QueryProvider>
          <AuthProvider>
            {children}
            <ToastContainer />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
