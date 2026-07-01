import { PrismaClient, Prisma } from '@prisma/client';

declare global { 
  var __prisma: PrismaClient | undefined; 
}

/**
 * P1 FIX: Ensure connection pooling params for Neon serverless Postgres.
 * Appends pgbouncer=true&connection_limit=5 if not already present.
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || '';
  if (!url) return url;
  
  const separator = url.includes('?') ? '&' : '?';
  const params: string[] = [];
  
  if (!url.includes('pgbouncer=')) params.push('pgbouncer=true');
  if (!url.includes('connection_limit=')) params.push('connection_limit=5');
  if (!url.includes('pool_timeout=')) params.push('pool_timeout=10');
  
  return params.length > 0 ? `${url}${separator}${params.join('&')}` : url;
}

// Optimized for Neon (serverless Postgres)
// Prevents "Error { kind: Closed }" by limiting connection pool
const prismaClientSingleton = () => {
  return new PrismaClient({ 
    log: process.env.NODE_ENV === 'development' ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: getDatabaseUrl(),
      }
    },
  });
};

export const prisma = globalThis.__prisma ?? prismaClientSingleton();

/**
 * A7: Retry wrapper for Prisma operations that may fail due to connection drops
 * during long LLM pauses (especially with GLM's 30-90s latency).
 * Catches "Connection closed" / "kind: Closed" errors and retries after reconnect.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isConnectionError =
        msg.includes('Connection closed') ||
        msg.includes('kind: Closed') ||
        msg.includes('Connection terminated') ||
        msg.includes("Can't reach database server") ||
        msg.includes('Timed out fetching a new connection');
      if (!isConnectionError || attempt === maxRetries - 1) throw err;
      console.warn(`[DB] Connection error (attempt ${attempt + 1}/${maxRetries}), retrying in ${baseDelayMs * (attempt + 1)}ms: ${msg}`);
      try {
        await prisma.$connect();
      } catch {
        // $connect may fail silently — the next query will trigger a fresh connection
      }
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Default export for compatibility
export default prisma;

// Singleton in dev to prevent hot-reload connection leaks
if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

// Graceful shutdown - disconnect pool on exit
if (typeof window === 'undefined') {
  process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
