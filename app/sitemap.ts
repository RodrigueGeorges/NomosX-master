import { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { publicPublicationWhere } from '@/lib/publication-visibility';
import { LOCALES, DEFAULT_LOCALE, NON_DEFAULT_LOCALES } from '@/i18n/routing';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';

/**
 * Build the URL for a given path and locale.
 * - Default locale (en): no prefix → nomosx.com/path
 * - Non-default (fr): prefixed → nomosx.com/fr/path
 */
function localizedUrl(path: string, locale: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) {
    return `${BASE_URL}${cleanPath}`;
  }
  return `${BASE_URL}/${locale}${cleanPath}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = [
    '/',
    '/archives',
    '/track-record',
    '/about',
    '/methodology',
    '/pricing',
    '/researchers',
    '/studio',
    '/privacy',
    '/terms',
  ];

  // Static pages — one entry per locale with hreflang alternates
  const staticPages: MetadataRoute.Sitemap = [];
  for (const path of staticPaths) {
    for (const locale of LOCALES) {
      const alternates: Record<string, string> = {};
      for (const altLocale of LOCALES) {
        const hreflang = altLocale === 'en' ? 'en' : altLocale;
        alternates[hreflang] = localizedUrl(path, altLocale);
      }
      // Also add x-default pointing to the default locale
      alternates['x-default'] = localizedUrl(path, DEFAULT_LOCALE);

      staticPages.push({
        url: localizedUrl(path, locale),
        lastModified: new Date(),
        changeFrequency: path === '/' ? 'daily' as const : path === '/archives' ? 'daily' as const : 'monthly' as const,
        priority: path === '/' ? 1.0 : path === '/archives' ? 0.9 : 0.7,
        alternates: { languages: alternates },
      });
    }
  }

  // Article pages — one entry per locale with hreflang alternates
  let inquiryPages: MetadataRoute.Sitemap = [];
  try {
    const articles = await prisma.thinkTankPublication.findMany({
      where: publicPublicationWhere(),
      select: { id: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 500,
    });

    for (const article of articles) {
      const path = `/inquiry/${article.id}`;
      for (const locale of LOCALES) {
        const alternates: Record<string, string> = {};
        for (const altLocale of LOCALES) {
          alternates[altLocale === 'en' ? 'en' : altLocale] = localizedUrl(path, altLocale);
        }
        alternates['x-default'] = localizedUrl(path, DEFAULT_LOCALE);

        inquiryPages.push({
          url: localizedUrl(path, locale),
          lastModified: article.publishedAt ?? new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
          alternates: { languages: alternates },
        });
      }
    }
  } catch {
    // DB unavailable at build time
  }

  return [...staticPages, ...inquiryPages];
}
