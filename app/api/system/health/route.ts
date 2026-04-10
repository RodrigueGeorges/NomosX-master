/**
 * System Health Check API
 * Returns health status of all services
 */

import { NextResponse } from 'next/server';
import { getCacheStats } from '@/lib/cache/redis-cache';
import { checkLLMHealth } from '@/lib/llm/unified-llm';
import { prisma } from '@/lib/db';
import Sentry from '@sentry/nextjs';

export async function GET() {
  try {
    const startTime = Date.now();

    // Check database
    let dbHealthy = false;
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
      dbHealthy = true;
    } catch (err) {
      console.error("Database health check failed:", err);
      Sentry.captureException(err);
    }

    // Check cache
    const cacheStats = await getCacheStats();

    // Check LLM providers
    const llmHealth = await checkLLMHealth();

    // Get system stats
    const [sourceCount, briefCount, jobsPending] = await Promise.all([
      prisma.source.count(),
      prisma.brief.count(),
      prisma.job.count({ where: { status: "PENDING" } }),
    ]);

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      status: dbHealthy && (llmHealth.openai || llmHealth.anthropic) ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      responseTime: totalTime,
      services: {
        database: {
          status: dbHealthy ? "up" : "down",
          latency: dbLatency,
          sources: sourceCount,
          briefs: briefCount,
        },
        cache: cacheStats
          ? {
              status: "up",
              keyCount: cacheStats.keyCount,
              memoryUsage: cacheStats.memoryUsage,
            }
          : { status: "disabled" },
        llm: {
          openai: llmHealth.openai ? "up" : "down",
          anthropic: llmHealth.anthropic ? "up" : "down",
        },
        jobs: {
          pending: jobsPending,
        },
      },
      version: "2.0.0",
    });
  } catch (error) {
    console.error("Health check error:", error);
    Sentry.captureException(error);

    return NextResponse.json(
      {
        status: "error",
        error: "Health check failed",
      },
      { status: 500 }
    );
  }
}
