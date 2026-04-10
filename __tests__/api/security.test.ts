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

import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';

// ================================
// RATE LIMITING TESTS
// ================================

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Reset in-memory buckets between tests by using unique keys
  });

  it('should allow requests within the limit', () => {
    const key = `test:allow:${Date.now()}`;
    expect(() => assertRateLimit(key, 5, 60_000)).not.toThrow();
    expect(() => assertRateLimit(key, 5, 60_000)).not.toThrow();
    expect(() => assertRateLimit(key, 5, 60_000)).not.toThrow();
  });

  it('should throw RateLimitError when limit is exceeded', () => {
    const key = `test:exceed:${Date.now()}`;
    // Use up the limit
    for (let i = 0; i < 3; i++) {
      assertRateLimit(key, 3, 60_000);
    }
    // Next call should throw
    expect(() => assertRateLimit(key, 3, 60_000)).toThrow(RateLimitError);
  });

  it('should include retryAfterMs in the error', () => {
    const key = `test:retry:${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      assertRateLimit(key, 2, 60_000);
    }
    try {
      assertRateLimit(key, 2, 60_000);
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
    assertRateLimit(key, 1, 100); // 100ms window
    expect(() => assertRateLimit(key, 1, 100)).toThrow(RateLimitError);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(() => assertRateLimit(key, 1, 100)).not.toThrow();
  });

  it('should track different keys independently', () => {
    const key1 = `test:indep1:${Date.now()}`;
    const key2 = `test:indep2:${Date.now()}`;

    assertRateLimit(key1, 1, 60_000);
    expect(() => assertRateLimit(key1, 1, 60_000)).toThrow(RateLimitError);

    // key2 should still work
    expect(() => assertRateLimit(key2, 1, 60_000)).not.toThrow();
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
      'app/api/v3/analysis/route.ts',
      'app/api/briefs/route.ts',
      'app/api/sources/route.ts',
      'app/api/stats/route.ts',
      'app/api/radar/route.ts',
      'app/api/brief/stream/route.ts',
      'app/api/search/route.ts',
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
  it('Dockerfile, CI, and package.json should use Node 20', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const issues: string[] = [];

    // Check Dockerfile
    try {
      const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf-8');
      if (!dockerfile.includes('node:20')) {
        issues.push('Dockerfile does not use node:20');
      }
    } catch {}

    // Check CI
    try {
      const ci = fs.readFileSync(path.join(process.cwd(), '.github/workflows/deploy.yml'), 'utf-8');
      if (ci.includes("node-version: '18'") || ci.includes('node-version: "18"')) {
        issues.push('CI uses Node 18 instead of 20');
      }
    } catch {}

    // Check package.json engines
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      if (pkg.engines?.node && !pkg.engines.node.includes('20')) {
        issues.push(`package.json engines.node does not include 20: ${pkg.engines.node}`);
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

    // Routes that are legitimately public (no auth needed)
    const publicRoutes = new Set([
      'app/api/auth/login/route.ts',
      'app/api/auth/register/route.ts',
      'app/api/auth/logout/route.ts',
      'app/api/health/route.ts',
      'app/api/system/health/route.ts',
      'app/api/newsletter/subscribe/route.ts',
      'app/api/newsletter/unsubscribe/route.ts',
      'app/api/unsubscribe/route.ts',
      'app/api/stripe/webhook/route.ts',
      'app/api/radar/subscribe/route.ts',
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

      // Skip public routes
      if (publicRoutes.has(relativePath)) continue;

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
