import {getRequestConfig} from 'next-intl/server';
import {hasLocale} from 'next-intl';
import {routing} from './routing';

/**
 * Server-side request configuration for next-intl.
 *
 * In Next.js 16.3+, the locale is provided via `next/root-params` by the
 * App Router. For broader compatibility (and route handlers where
 * root-params is not yet available), we fall back to the routing default.
 *
 * Messages are loaded per-locale from `messages/<locale>.json`.
 */
export default getRequestConfig(async ({requestLocale}) => {
  // `requestLocale` is provided by `next/root-params` (Next.js 16.3+) or
  // by the middleware locale cookie for older versions / route handlers.
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const en = (await import('../messages/en.json')).default;
  let messages = en;
  if (locale !== 'en') {
    try {
      const localized = (await import(`../messages/${locale}.json`)).default;
      // Shallow-merge: a namespace absent from the locale file falls back
      // to English rather than crashing the whole page.
      messages = { ...en, ...localized };
    } catch {
      // File not generated yet — English chrome, translated article bodies.
    }
  }

  return { locale, messages };
});
