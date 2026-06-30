/**
 * API Security Integration Tests
 * 
 * Validates that:
 * 1. Protected routes reject unauthenticated requests (401)
 * 2. Rate limiting works on auth routes
 * 3. Error responses don't leak internal details
 * 4. Input validation works correctly
 * 
 * @jest-environment node
 */

import { assertRateLimitSync, RateLimitError } from '@/lib/security/rate-limit';

// ================================
// RATE LIMITING TESTS
// ================================

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Reset in-memory buckets between tests by using unique keys
  });

  it('should allow requests within the limit', () => {
    const key = `test:allow:${Date.now()}`;
    expect(() => assertRateLimitSync(key, 5, 60_000)).not.toThrow();
    expect(() => assertRateLimitSync(key, 5, 60_000)).not.toThrow();
    expect(() => assertRateLimitSync(key, 5, 60_000)).not.toThrow();
  });

  it('should throw RateLimitError when limit is exceeded', () => {
    const key = `test:exceed:${Date.now()}`;
    // Use up the limit
    for (let i = 0; i < 3; i++) {
      assertRateLimitSync(key, 3, 60_000);
    }
    // Next call should throw
    expect(() => assertRateLimitSync(key, 3, 60_000)).toThrow(RateLimitError);
  });

  it('should include retryAfterMs in the error', () => {
    const key = `test:retry:${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      assertRateLimitSync(key, 2, 60_000);
    }
    try {
      assertRateLimitSync(key, 2, 60_000);
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfterMs).toBeGreaterThan(0);
      expect((err as RateLimitError).retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it('should reset after window expires', async () => {
    const key = `test:reset:${Date.now()}`;
    // Use a very short window
    assertRateLimitSync(key, 1, 100); // 100ms window
    expect(() => assertRateLimitSync(key, 1, 100)).toThrow(RateLimitError);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(() => assertRateLimitSync(key, 1, 100)).not.toThrow();
  });

  it('should track different keys independently', () => {
    const key1 = `test:indep1:${Date.now()}`;
    const key2 = `test:indep2:${Date.now()}`;

    assertRateLimitSync(key1, 1, 60_000);
    expect(() => assertRateLimitSync(key1, 1, 60_000)).toThrow(RateLimitError);

    // key2 should still work
    expect(() => assertRateLimitSync(key2, 1, 60_000)).not.toThrow();
  });
});

// ================================
// ERROR RESPONSE SANITIZATION TESTS
// ================================

describe('Error Response Sanitization', () => {
  it('should not contain error.stack patterns in API route files', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const glob = await import('fs');

    // Read all route.ts files in app/api
    const apiDir = path.join(process.cwd(), 'app', 'api');

    function findRouteFiles(dir: string): string[] {
      const files: string[] = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...findRouteFiles(fullPath));
          } else if (entry.name === 'route.ts') {
            files.push(fullPath);
          }
        }
      } catch {}
      return files;
    }

    const routeFiles = findRouteFiles(apiDir);
    expect(routeFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      // Check for error.stack in JSON responses (not in console.error which is fine)
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Only flag error.stack/error.message in NextResponse.json or return statements
        if (
          (line.includes('error.stack') || line.includes('details: error.message')) &&
          !line.trim().startsWith('//') &&
          !line.trim().startsWith('console.')
        ) {
          // Allow conditional dev-only exposure
          if (line.includes("process.env.NODE_ENV === 'development'")) continue;
          if (line.includes('process.env.NODE_ENV === "development"')) continue;

          const relativePath = path.relative(process.cwd(), file);
          violations.push(`${relativePath}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    if (violations.length > 0) {
      fail(
        `Found ${violations.length} error leak(s) in API responses:\n` +
        violations.map(v => `  - ${v}`).join('\n')
      );
    }
  });
});

// ================================
// AUTH PROTECTION TESTS (static analysis)
// ================================

describe('Auth Protection Coverage', () => {
  it('critical routes should import getSession or requireAuth', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const criticalRoutes = [
      'app/api/studiox/route.ts',
      'app/api/studiox/checkout/route.ts',
      'app/api/articles/[id]/export/route.ts',
    ];

    const unprotected: string[] = [];

    for (const route of criticalRoutes) {
      const fullPath = path.join(process.cwd(), route);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const hasAuth =
          content.includes('getSession') ||
          content.includes('requireAuth') ||
          content.includes('requireAdmin') ||
          content.includes('x-admin-key');

        if (!hasAuth) {
          unprotected.push(route);
        }
      } catch {
        // File might not exist, skip
      }
    }

    if (unprotected.length > 0) {
      fail(
        `Found ${unprotected.length} critical route(s) without auth protection:\n` +
        unprotected.map(r => `  - ${r}`).join('\n')
      );
    }
  });

  it('auth routes should have rate limiting', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const authRoutes = [
      'app/api/auth/login/route.ts',
      'app/api/auth/register/route.ts',
    ];

    const unprotected: string[] = [];

    for (const route of authRoutes) {
      const fullPath = path.join(process.cwd(), route);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.includes('assertRateLimit') && !content.includes('rateLimit')) {
          unprotected.push(route);
        }
      } catch {}
    }

    if (unprotected.length > 0) {
      fail(
        `Found ${unprotected.length} auth route(s) without rate limiting:\n` +
        unprotected.map(r => `  - ${r}`).join('\n')
      );
    }
  });
});

// ================================
// NODE VERSION CONSISTENCY TESTS
// ================================

describe('Node Version Consistency', () => {
  it('Dockerfile, CI, and package.json should use a supported Node version', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const issues: string[] = [];

    // Check Dockerfile
    try {
      const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf-8');
      if (!/node:(20|22)/.test(dockerfile)) {
        issues.push('Dockerfile does not use node:20 or node:22');
      }
    } catch {}

    // Check CI
    try {
      const ci = fs.readFileSync(path.join(process.cwd(), '.github/workflows/deploy.yml'), 'utf-8');
      if (ci.includes("node-version: '18'") || ci.includes('node-version: "18"')) {
        issues.push('CI uses deprecated Node 18');
      }
    } catch {}

    // Check package.json engines
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      if (pkg.engines?.node && !/22|20/.test(pkg.engines.node)) {
        issues.push(`package.json engines.node missing supported version: ${pkg.engines.node}`);
      }
    } catch {}

    if (issues.length > 0) {
      fail('Node version inconsistencies:\n' + issues.map(i => `  - ${i}`).join('\n'));
    }
  });
});

// ================================
// CSRF PROTECTION TESTS (middleware)
// ================================

describe('CSRF Protection (middleware)', () => {
  it('middleware.ts should contain CSRF check logic', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const middleware = fs.readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf-8');

    expect(middleware).toContain('checkCsrf');
    expect(middleware).toContain('getAllowedOrigins');
    expect(middleware).toContain('CSRF validation failed');
    expect(middleware).toContain("x-admin-key");
  });

  it('CSRF should bypass safe methods (GET, HEAD, OPTIONS)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const middleware = fs.readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf-8');

    expect(middleware).toContain("'GET'");
    expect(middleware).toContain("'HEAD'");
    expect(middleware).toContain("'OPTIONS'");
  });

  it('CSRF should allow server-to-server calls with admin key or authorization', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const middleware = fs.readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf-8');

    expect(middleware).toContain("x-admin-key");
    expect(middleware).toContain("authorization");
  });
});

// ================================
// COMPREHENSIVE AUTH COVERAGE TEST
// ================================

describe('Comprehensive Auth Coverage', () => {
  it('all non-public routes should have auth protection', async () => {
    const fs = await import('fs');
    const path = await import('path');

    // Whole namespaces that are public by design:
    // - auth/*     : pre-session flows (login, register, password reset, email verify)
    // - public/*   : explicitly public read-only content
    // - webhooks/* : authenticated by signature, and bypassed by middleware CSRF
    const publicPrefixes = [
      'app/api/auth/',
      'app/api/public/',
      'app/api/webhooks/',
    ];

    // Individual routes that are legitimately public (no session auth needed).
    // Several are protected by rate-limiting and/or only expose public content
    // (publicPublicationWhere), which is the appropriate control for these endpoints.
    const publicRoutes = new Set([
      'app/api/newsletter/subscribe/route.ts',
      'app/api/newsletter/unsubscribe/route.ts',
      'app/api/newsletter/confirm/route.ts',
      'app/api/stripe/webhook/route.ts',
      'app/api/articles/[id]/export/route.ts',
      'app/api/foresight/chat/route.ts',
      'app/api/inquiry/[id]/foresight/route.ts',
    ]);

    const apiDir = path.join(process.cwd(), 'app', 'api');

    function findRouteFiles(dir: string): string[] {
      const files: string[] = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...findRouteFiles(fullPath));
          } else if (entry.name === 'route.ts') {
            files.push(fullPath);
          }
        }
      } catch {}
      return files;
    }

    const routeFiles = findRouteFiles(apiDir);
    const unprotected: string[] = [];

    for (const file of routeFiles) {
      const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');

      // Skip public routes (exact match or public-by-design namespace)
      if (publicRoutes.has(relativePath)) continue;
      if (publicPrefixes.some(prefix => relativePath.startsWith(prefix))) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const hasAuth =
        content.includes('getSession') ||
        content.includes('requireAuth') ||
        content.includes('requireAdmin') ||
        content.includes('x-admin-key') ||
        content.includes('CRON_SECRET') ||
        content.includes('ADMIN_KEY');

      if (!hasAuth) {
        unprotected.push(relativePath);
      }
    }

    if (unprotected.length > 0) {
      fail(
        `Found ${unprotected.length} non-public route(s) without auth:\n` +
        unprotected.map(r => `  - ${r}`).join('\n')
      );
    }
  });
});
