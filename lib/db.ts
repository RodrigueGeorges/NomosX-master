import { PrismaClient } from '@prisma/client';

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
