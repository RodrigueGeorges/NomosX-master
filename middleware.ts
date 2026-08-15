import {NextRequest, NextResponse} from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import {routing} from './i18n/routing';

// ----------------------------------------------------------------------------
// next-intl middleware — handles locale detection, prefixing (/fr) and the
// NEXT_LOCALE cookie. Runs first, before CSRF / auth / security headers.
// ----------------------------------------------------------------------------
const intlMiddleware = createIntlMiddleware(routing);

// ----------------------------------------------------------------------------
// Existing NomosX middleware logic (CSRF + auth guard + security headers)
// ----------------------------------------------------------------------------

// Allowed origins for CSRF validation
function getAllowedOrigins(): string[] {
  const origins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  if (process.env.NEXT_PUBLIC_APP_URL) origins.push(process.env.NEXT_PUBLIC_APP_URL);
  if (process.env.URL) origins.push(process.env.URL);
  return origins;
}

function checkCsrf(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

  const {pathname} = request.nextUrl;

  // Only cron/webhook routes bypass CSRF — they use CRON_SECRET or webhook signatures
  const isInternalRoute =
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname === '/api/studiox/process' ||
    pathname === '/api/stripe/webhook';
  if (isInternalRoute) {
    const adminKey = request.headers.get('x-admin-key');
    const authHeader = request.headers.get('authorization');
    if (adminKey || authHeader) return true;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const allowed = getAllowedOrigins();

  if (origin) return allowed.includes(origin);
  if (referer) {
    try { return allowed.includes(new URL(referer).origin); } catch { return false; }
  }
  // No origin/referer on a mutation from a non-internal route → block
  return false;
}

// Route prefixes that are NOT locale-prefixed and should bypass i18n entirely.
// API routes, Next.js internals, and static assets are excluded via the matcher.
const NON_LOCALE_PREFIXES = ['/api', '/_next', '/favicon', '/robots', '/sitemap'];

function isNonLocaleRoute(pathname: string): boolean {
  return NON_LOCALE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(request: NextRequest) {
  const {pathname} = request.nextUrl;

  // 1. next-intl: locale negotiation + prefix handling.
  //    Skipped for API and other non-locale routes.
  if (!isNonLocaleRoute(pathname)) {
    const intlResponse = await intlMiddleware(request);
    // intlMiddleware may return a response (redirect for locale prefixing)
    // or `NextResponse.next()` for already-canonical URLs. We only short-circuit
    // when it actually redirects; otherwise we continue to apply CSRF/auth/headers
    // on the same response object.
    if (intlResponse instanceof NextResponse) {
      const isRedirect =
        intlResponse.status >= 300 && intlResponse.status < 400;
      if (isRedirect) {
        return intlResponse;
      }
      // Carry on with security headers + auth on the intl response
      return applySecurityAndAuth(request, intlResponse);
    }
  }

  return applySecurityAndAuth(request, NextResponse.next());
}

/**
 * Apply CSRF validation, auth guard and security headers to a response.
 * Factored out so both the intl and non-intl paths share the same logic.
 */
function applySecurityAndAuth(request: NextRequest, response: NextResponse): NextResponse {
  const {pathname} = request.nextUrl;
  const isApi = pathname.startsWith('/api');

  // CSRF protection for API mutations
  if (isApi && !checkCsrf(request)) {
    return NextResponse.json({error: 'CSRF validation failed'}, {status: 403});
  }

  // Auth guard for internal dashboard API routes
  if (isApi && pathname.startsWith('/api/dashboard/')) {
    const session = request.cookies.get('nomosx-session')?.value;
    if (!session) {
      return NextResponse.json({error: 'Authentication required'}, {status: 401});
    }
  }

  // Auth guard: redirect to homepage if no session cookie on protected routes.
  // Match protected prefixes regardless of locale prefix (e.g. /fr/studio).
  const protectedPatterns = [
    '/studio', '/fr/studio',
    '/learning', '/fr/learning',
    '/witness', '/fr/witness',
    '/moat', '/fr/moat',
  ];
  const isProtected = protectedPatterns.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  if (isProtected) {
    const session = request.cookies.get('nomosx-session')?.value;
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('auth', 'required');
      return NextResponse.redirect(url);
    }
  }

  // Security headers for ALL routes
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // CSP only for pages (not API — would break JSON responses)
  if (!isApi) {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // unsafe-inline needed for Next.js runtime chunks + JSON-LD
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    response.headers.set('Content-Security-Policy', csp);
  }

  // Prevent search engines from indexing API responses
  if (isApi) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return response;
}

export const config = {
  // Match everything except static assets. next-intl needs to run on page
  // routes to handle locale prefixing; the rest (CSRF, headers) applies to
  // API routes too.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|favicon.ico|robots.txt|sitemap.xml|feed.xml).*)',
  ],
};
