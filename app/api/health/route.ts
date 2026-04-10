import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/health
 * 
 * Health check endpoint for monitoring
 * Returns system status and key metrics
 */
export async function GET(req: NextRequest) {
  try {
    const startTime = Date.now();

    // Check database connection
    let dbStatus = "healthy";
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
    } catch (error) {
      dbStatus = "unhealthy";
      console.error("[Health] Database check failed:", error);
    }

    // Check Redis connection
    let redisStatus = "not_configured";
    let redisLatency = 0;
    if (process.env.REDIS_URL) {
      try {
        const Redis = require('ioredis');
        const redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          lazyConnect: true,
        });
        const redisStart = Date.now();
        await redis.ping();
        redisLatency = Date.now() - redisStart;
        redisStatus = "healthy";
        await redis.quit();
      } catch {
        redisStatus = "unhealthy";
      }
    }

    // Get basic stats
    const [userCount, publicationCount, verticalCount] = await Promise.all([
      prisma.user.count().catch(() => 0),
      prisma.thinkTankPublication.count({ where: { status: "PUBLISHED" } }).catch(() => 0),
      prisma.vertical.count({ where: { isActive: true } }).catch(() => 0),
    ]);

    const totalLatency = Date.now() - startTime;
    const allHealthy = dbStatus === "healthy" && (redisStatus === "healthy" || redisStatus === "not_configured");

    return NextResponse.json({
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      version: "2.0",
      checks: {
        database: {
          status: dbStatus,
          latency: `${dbLatency}ms`,
        },
        redis: {
          status: redisStatus,
          latency: redisStatus === "healthy" ? `${redisLatency}ms` : undefined,
        },
        api: {
          status: "healthy",
          latency: `${totalLatency}ms`,
        },
      },
      metrics: {
        users: userCount,
        publications: publicationCount,
        verticals: verticalCount,
      },
    });
  } catch (error: any) {
    console.error("[Health] Error:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Internal server error",
      },
      { status: 503 }
    );
  }
}
