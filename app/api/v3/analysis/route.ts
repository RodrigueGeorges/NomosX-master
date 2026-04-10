/**
 * API Route: /api/v3/analysis
 * 
 * Uses the unified pipeline with query enhancement, relevance filtering, and Cohere reranking.
 */

import { NextRequest,NextResponse } from 'next/server';
import { runPipeline, type Providers } from '@/lib/agent/pipeline-v2';
import { getSession } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';
import { assertAndConsumeRun, QuotaError } from '@/lib/security/quota';
import { z } from 'zod';

const analysisSchema = z.object({
  question: z.string().min(3, 'Question too short').max(2000, 'Question too long'),
  providers: z.array(z.string()).optional(),
  format: z.enum(['brief', 'strategic', 'dossier']).optional(),
  options: z.object({
    perProvider: z.number().int().min(1).max(100).optional(),
    minRelevance: z.number().min(0).max(1).optional(),
    topSources: z.number().int().min(1).max(50).optional(),
    useReranking: z.boolean().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      await assertRateLimit(`v3-analysis:user:${user.id}`, 10, 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } }
        );
      }
      throw err;
    }

    const body = await req.json();
    const validation = analysisSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { question, providers, format, options } = validation.data;

    // Quota enforcement
    try {
      await assertAndConsumeRun(user.id);
    } catch (err) {
      if (err instanceof QuotaError) {
        return NextResponse.json(
          { error: err.message },
          { status: 429 }
        );
      }
      throw err;
    }

    const selectedProviders: Providers = Array.isArray(providers) && providers.length > 0
      ? providers as Providers
      : ["openalex", "semanticscholar", "crossref"];

    console.log(`[API /v3/analysis] question="${question}" format=${format || "brief"} providers=${(selectedProviders as string[]).join(",")}`);

    const result = await runPipeline(question, format || "brief", {
      providers: selectedProviders,
      perProvider: options?.perProvider || 20,
    });

    return NextResponse.json({
      success: true,
      briefId: result.briefId,
      stats: result.stats,
      format: format || "brief",
    });
  } catch (error: any) {
    console.error("[API /v3/analysis] Error:", error);
    return NextResponse.json(
      {
        error: "Analysis failed",
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
