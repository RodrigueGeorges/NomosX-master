import { NextRequest,NextResponse } from 'next/server';
import { scout } from '@/lib/agent/pipeline-v2';
import { indexAgent,deduplicateSources } from '@/lib/agent/index-agent';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { assertRateLimit,RateLimitError } from '@/lib/security/rate-limit';
import { assertAndConsumeRun,QuotaError } from '@/lib/security/quota';
import { z } from 'zod';

const ingestionSchema = z.object({
  query: z.string().min(2, 'Query too short').max(500, 'Query too long'),
  providers: z.array(z.string()).min(1, 'At least one provider required'),
  perProvider: z.number().int().min(1).max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Auth (P0)
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit (P0)
    try {
      assertRateLimit(`ingestion-run:user:${user.id}`, 20, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429, headers: { "Retry-After": String(Math.ceil(err.retryAfterMs / 1000)) } }
        );
      }
      throw err;
    }

    // Quota (P0)
    try {
      await assertAndConsumeRun(user.id);
    } catch (err) {
      if (err instanceof QuotaError) {
        return NextResponse.json({ error: err.message }, { status: 402 });
      }
      throw err;
    }

    const body = await req.json();
    const validation = ingestionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { query, providers, perProvider } = validation.data;

    console.log(`[Ingestion] Starting: query="${query}", providers=${providers.join(",")}, perProvider=${perProvider || 20}`);

    // 1. SCOUT: Collect sources
    console.log("[Ingestion] Step 1/4: SCOUT (collecte sources)");
    const scoutResult = await scout(query, providers as any[], perProvider || 20);
    // Handle both cached array and fresh result object
    const found = Array.isArray(scoutResult) ? scoutResult.length : (scoutResult.found || 0);
    const upserted = Array.isArray(scoutResult) ? 0 : (scoutResult.upserted || 0);
    const sourceIds = Array.isArray(scoutResult) ? scoutResult.map(s => s.id) : (scoutResult.sourceIds || []);
    
    console.log(`[Ingestion] SCOUT done: ${found} found, ${upserted} upserted`);

    if (sourceIds.length === 0) {
      return NextResponse.json({
        found: 0,
        upserted: 0,
        authorsCreated: 0,
        institutionsCreated: 0,
        message: "No sources found for this query",
      });
    }

    // 2. INDEX: Enrich authors + institutions
    console.log("[Ingestion] Step 2/4: INDEX (enrichissement)");
    const indexResult = await indexAgent(sourceIds);
    console.log(`[Ingestion] INDEX done: ${indexResult.enriched} enriched, ${indexResult.errors.length} errors`);

    // 3. DEDUPE: Remove duplicates
    console.log("[Ingestion] Step 3/4: DEDUPE (dédoublonnage)");
    const dedupeResult = await deduplicateSources();
    console.log(`[Ingestion] DEDUPE done: ${dedupeResult.removed} duplicates removed`);

    // 4. Get stats
    console.log("[Ingestion] Step 4/4: STATS (statistiques finales)");
    const [authorsCount, institutionsCount] = await Promise.all([
      prisma.author.count(),
      prisma.institution.count(),
    ]);

    const result = {
      found: found,
      upserted: upserted - dedupeResult.removed,
      authorsCreated: authorsCount,
      institutionsCreated: institutionsCount,
      message: "Ingestion completed successfully",
    };

    console.log(`[Ingestion] Complete:`, result);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Ingestion] Error:", error);
    return NextResponse.json(
      {
        error: "Ingestion failed",
      },
      { status: 500 }
    );
  }
}
