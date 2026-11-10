import React from 'react';
import Script from 'next/script';
import {Barlow, Barlow_Semi_Condensed, JetBrains_Mono} from 'next/font/google';
import {NextIntlClientProvider} from 'next-intl';
import {getMessages, getTranslations, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';

import {ToastContainer} from '@/components/ui/Toast';
import {AuthProvider} from '@/hooks/useAuth';
import {QueryProvider} from '@/components/providers/QueryProvider';
import {ThemeProvider} from 'next-themes';

import {routing, type AppLocale, LOCALES, DEFAULT_LOCALE} from '@/i18n/routing';

// Font configuration
/** Barlow ≈ D-DIN (géométrique/grotesque libre — grammaire SpaceX) */
const barlow = Barlow({
  subsets: ['latin'],
  variable: '--font-primary',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

/** Barlow Semi Condensed — titres hero uppercase (D-DIN-Bold) */
const barlowCondensed = Barlow_Semi_Condensed({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
});

// Tell Next.js which locale segments to pre-render at build time.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Brand'});
  const tMeta = await getTranslations({locale, namespace: 'Metadata'});

  const ogLocale = locale === 'fr' ? tMeta('localeFr') : tMeta('localeEn');

  const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';
  // hreflang alternates — canonical for each locale
  const languages: Record<string, string> = {};
  for (const loc of LOCALES) {
    const prefix = loc === DEFAULT_LOCALE ? '' : `/${loc}`;
    languages[loc] = `${BASE}${prefix}`;
  }
  languages['x-default'] = BASE;

  // Canonical for this locale
  const canonicalPrefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const canonical = `${BASE}${canonicalPrefix}`;

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    ),
    title: {
      default: t('title'),
      template: `%s | ${t('name')}`,
    },
    description: t('description'),
    authors: [{name: t('name')}],
    creator: t('name'),
    icons: {
      icon: [
        {url: '/favicon.svg', type: 'image/svg+xml'},
        {url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon'},
      ],
      apple: [
        {url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png'},
      ],
      shortcut: '/favicon.ico',
    },
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical,
      languages,
      types: {
        'application/rss+xml': '/feed.xml',
      },
    },
    openGraph: {
      type: 'website',
      locale: ogLocale,
      siteName: t('name'),
      title: t('title'),
      description: t('ogDescription'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('ogDescription'),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;

  // Validate locale
  if (!routing.locales.includes(locale as AppLocale)) {
    notFound();
  }

  // Enable static rendering for this locale
  setRequestLocale(locale);

  const messages = await getMessages();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NomosX',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com',
    logo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com'}/favicon.svg`,
    description:
      'A think tank for scenario-weighted reasoning — cross-domain mapping, adversarial review, and source-verified positions published without agenda.',
    sameAs: ['https://x.com/nomosx_ai', 'https://github.com/nomosx'],
    foundingDate: '2024',
    knowsAbout: [
      'Strategic Analysis',
      'Scenario Planning',
      'Decision Intelligence',
      'Evidence-Based Policy',
      'Cross-Domain Research',
      'Scenario Planning',
    ],
  };

  return (
    <html
      lang={locale}
      className={`${barlow.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-primary" suppressHydrationWarning>
        <Script
          id="jsonld-organization"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd).replace(/</g, '\\u003c')}}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-white dark:focus:bg-black focus:text-black dark:focus:text-white focus:text-sm focus:font-mono focus:uppercase focus:tracking-wider"
        >
          Skip to main content
        </a>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            <QueryProvider>
              <AuthProvider>
                <div id="main-content">{children}</div>
                <ToastContainer />
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
