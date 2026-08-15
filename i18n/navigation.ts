import {createNavigation} from 'next-intl/navigation';
import {routing} from './routing';

/**
 * Localized navigation helpers (Link, redirect, usePathname, useRouter).
 *
 * Usage in components:
 *   import {Link, useRouter, usePathname, redirect} from '@/i18n/navigation';
 *   <Link href="/archives">...</Link>          // auto-prefixes with locale
 *   const router = useRouter();
 *   router.push('/archives');                  // auto-prefixes with locale
 *
 * These replace the raw `next/link` and `next/navigation` imports in
 * locale-aware components so that the `/fr` prefix is handled automatically.
 */
export const {Link, redirect, usePathname, useRouter, getPathname} =
  createNavigation(routing);
