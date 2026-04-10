import { NextRequest, NextResponse } from 'next/server';

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

  const { pathname } = request.nextUrl;

  // Only cron/webhook routes bypass CSRF — they use CRON_SECRET or webhook signatures
  const isInternalRoute = pathname.startsWith('/api/cron/') || pathname.startsWith('/api/webhooks/');
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api');

  // CSRF protection for API mutations
  if (isApi && !checkCsrf(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  // Auth guard: redirect to homepage if no session cookie on protected routes
  const protectedPrefixes = ['/dashboard', '/studio', '/council'];
  const isProtected = protectedPrefixes.some(p => pathname.startsWith(p));
  if (isProtected) {
    const session = request.cookies.get('nomosx-session')?.value;
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('auth', 'required');
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next();

  // Security headers for ALL routes
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // CSP only for pages (not API — would break JSON responses)
  if (!isApi) {
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:;"
    );
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}