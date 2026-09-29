import {defineRouting} from 'next-intl/routing';

/**
 * i18n routing configuration for NomosX.
 *
 * Strategy: `as-needed`
 * - English (default locale) is served at the root WITHOUT a prefix
 *   (e.g. `nomosx.com/archives`). This preserves the existing EN URLs and
 *   the SEO equity already accumulated.
 * - French is served under `/fr` (e.g. `nomosx.com/fr/archives`).
 *
 * Rationale: NomosX launched in English. Adding `/fr` as a secondary
 * locale avoids breaking existing backlinks and keeps the sitemap stable
 * for the default locale.
 */
export const routing = defineRouting({
  // All 24 official EU languages. Locales whose messages/<locale>.json file
  // hasn't been generated yet fall back to English chrome (see request.ts)
  // while articles already translate lazily via getPublicationInLocale.
  locales: [
    'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ro', 'bg', 'cs', 'da',
    'el', 'et', 'fi', 'hr', 'hu', 'ga', 'lt', 'lv', 'mt', 'sk', 'sl', 'sv',
  ] as const,
  defaultLocale: 'en',
  localePrefix: 'as-needed',
});

/** Native display names — language names never need translating. */
export { LOCALE_NAMES } from './locale-names';

export type AppLocale = (typeof routing.locales)[number];

export const LOCALES = routing.locales;
export const DEFAULT_LOCALE = routing.defaultLocale;

/** Non-default locales that require a path prefix. */
export const NON_DEFAULT_LOCALES = LOCALES.filter(
  (l) => l !== DEFAULT_LOCALE
) as string[];
