import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runPipeline } from '@/lib/agent/pipeline-v2';
import { selectSmartProviders } from '@/lib/agent/smart-provider-selector';
import { requireResearcherTier, hasExceededWeeklyLimit, createAccessDeniedResponse, createLimitExceededResponse } from '@/lib/middleware/subscription';
import { trackBriefCommissioned } from '@/lib/analytics';
import { z } from 'zod';

const autoBriefSchema = z.object({
  question: z.string().min(3, 'Question too short').max(2000, 'Question too long'),
  format: z.enum(['brief', 'strategic']).optional().default('brief'),
});

/**
 * API Auto-Brief — Unified pipeline entry point (V8)
 *
 * Delegates entirely to runPipeline() which runs:
 * CONTEXT PRIMER → SCOUT (smart providers) → INDEX → EMBED → DEDUP → RANK
 * → READER V3 → ANALYST V3 → HARVARD COUNCIL → GUARD → EDITOR
 * → CITATION VERIFIER → CRITICAL LOOP V2 → DEBATE → META-ANALYSIS
 * → DEVIL'S ADVOCATE → PUBLISHER → KNOWLEDGE GRAPH
 */
export async function POST(req: NextRequest) {
  try {
    // Check subscription tier (RESEARCHER+ or active trial required)
    const subscriptionCheck = await requireResearcherTier(req);
    if (!subscriptionCheck.allowed) {
      return createAccessDeniedResponse('RESEARCHER', subscriptionCheck.subscription?.tier);
    }

    // Check weekly limits
    if (hasExceededWeeklyLimit(subscriptionCheck.subscription!)) {
      return createLimitExceededResponse('weekly');
    }

    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const validation = autoBriefSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { question, format } = validation.data;

    // Async smart provider selection (P2-L: history-aware)
    const smartSelection = await selectSmartProviders(question).catch(() => null);

    // Run the unified pipeline — all 16 steps handled internally
    const result = await runPipeline(question, format, {
      providers: smartSelection?.providers as any,
    });

    // Track brief commissioning analytics (non-blocking)
    trackBriefCommissioned(session.id, {
      format: format,
      questionLength: question.length,
      estimatedTime: smartSelection?.estimatedTime ? parseInt(smartSelection.estimatedTime) : undefined,
    }).catch(err => console.error('[Brief Auto] Analytics tracking failed:', err));

    return NextResponse.json({
      success: true,
      briefId: result.briefId,
      briefUrl: `/briefs/${result.briefId}`,
      format: result.format,
      pipelineRunId: result.pipelineRunId,
      smartSelection: smartSelection ? {
        providers: smartSelection.providers,
        reasoning: smartSelection.reasoning,
        estimatedTime: smartSelection.estimatedTime,
      } : null,
      stats: {
        sourcesFound: result.stats?.scout?.found || 0,
        sourcesUsed: result.stats?.rank?.count || 0,
        trustScore: result.stats?.criticalLoop?.finalScore || 0,
        qualityScore: result.stats?.rank?.avgQuality || 0,
        citationIntegrity: result.stats?.citationVerifier?.integrity || 0,
        devilsAdvocate: result.stats?.devilsAdvocate?.verdict || null,
      },
    });

  } catch (error: any) {
    console.error("Auto-brief error:", error);
    return NextResponse.json(
      {
        error: "pipeline_error",
        message: process.env.NODE_ENV === "development" ? error.message : "Une erreur est survenue lors de la génération du brief",
      },
      { status: 500 }
    );
  }
}
