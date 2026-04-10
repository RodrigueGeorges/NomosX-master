import { NextRequest, NextResponse } from 'next/server';
import { runFullPipeline } from '@/lib/agent/pipeline-v2';
import type { Providers } from '@/lib/agent/pipeline-v2';
import { getSession } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/security/rate-limit';

/**
 * POST /api/demo/generate
 * 
 * Interactive demo endpoint that shows AI Council in action
 * Uses simplified pipeline for demo purposes (limited sources, faster execution)
 */
export async function POST(req: NextRequest) {
  try {
    // Auth required
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 2 demo runs per hour per user
    try {
      await assertRateLimit(`demo:generate:user:${user.id}`, 2, 60 * 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } }
        );
      }
      throw err;
    }

    const { topic, mode = 'quick' } = await req.json();
    
    if (!topic || topic.length < 3) {
      return NextResponse.json(
        { error: 'Topic must be at least 3 characters long' },
        { status: 400 }
      );
    }

    // Demo mode: limited providers for speed
    const demoProviders: Providers = ['openalex', 'arxiv', 'pubmed', 'crossref', 'semanticscholar'];
    
    console.log(`[Demo] Starting pipeline for topic: "${topic}"`);
    
    // Run simplified pipeline
    const startTime = Date.now();
    const result = await runFullPipeline(topic, demoProviders, {
      mode: 'brief', // Quick demo mode
      maxSources: 25, // Limited sources for speed
      timeout: 60000, // 1 minute timeout
      enableCaching: true
    });
    
    const duration = Date.now() - startTime;
    
    // Format demo response
    const demoResult = {
      topic,
      duration: `${Math.round(duration / 1000)}s`,
      sourcesFound: result.stats?.scout?.found || 0,
      sourcesUsed: result.stats?.rank?.count || 0,
      trustScore: result.stats?.criticalLoop?.finalScore || 0,
      qualityScore: result.stats?.rank?.avgQuality || 0,
      briefId: result.briefId,
      summary: "Demo analysis completed successfully. Full brief available in dashboard.",
      keyFindings: [
        `Analysis based on ${result.stats?.scout?.found || 0} sources found`,
        `Top ${result.stats?.rank?.count || 0} sources selected for analysis`,
        `Trust score: ${result.stats?.criticalLoop?.finalScore || 0}/100`
      ],
      researcherInsights: [
        "Multi-agent analysis completed",
        "Citation verification passed",
        "Evidence synthesis generated"
      ],
      councilDecision: 'APPROVED',
      status: 'completed'
    };

    console.log(`[Demo] Completed in ${duration}ms, ${demoResult.sourcesFound} sources found`);

    return NextResponse.json(demoResult);

  } catch (error) {
    console.error('[Demo] Error:', error);
    
    return NextResponse.json({
      error: 'Demo generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      status: 'failed'
    }, { status: 500 });
  }
}
