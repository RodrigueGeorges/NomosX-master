import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runPipeline } from '@/lib/agent/pipeline-v2';
import { requireStudioTier, hasExceededStudioLimit, createAccessDeniedResponse, createLimitExceededResponse } from '@/lib/middleware/subscription';
import { evaluatePublicationReadiness } from '@/lib/publication-visibility';

/**
 * POST /api/studio/analyze
 * 
 * STRATEGY tier only endpoint for custom research
 * Checks studio limits and decrements quota
 */
export async function POST(req: NextRequest) {
  try {
    // Check STUDIO tier access
    const subscriptionCheck = await requireStudioTier(req);
    if (!subscriptionCheck.allowed) {
      return createAccessDeniedResponse('STUDIO', subscriptionCheck.subscription?.tier);
    }

    // Check studio limits
    if (hasExceededStudioLimit(subscriptionCheck.subscription!)) {
      return createLimitExceededResponse('studio');
    }

    const subscription = subscriptionCheck.subscription!;

    const session = await getSession();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { question, publicationType = 'EXECUTIVE_BRIEF', verticalId } = body;

    if (!question || question.trim().length < 10) {
      return NextResponse.json({ error: "Question must be at least 10 characters" }, { status: 400 });
    }

    // Increment studio usage
    await prisma.subscription.update({
      where: { userId: session.id },
      data: { studioQuestionsUsed: { increment: 1 } },
    });

    // Run the pipeline
    const mode = publicationType === 'STRATEGIC_REPORT' ? 'strategic' : 'brief';
    const result = await runPipeline(question.trim(), mode, { perProvider: mode === 'strategic' ? 25 : 20 });

    // Persist as ThinkTankPublication if pipeline succeeded
    let publicationId: string | null = null;
    if (result.briefId) {
      const brief = await prisma.brief.findUnique({
        where: { id: result.briefId },
        select: { html: true, sources: true, question: true },
      }).catch(() => null);

      const vertical = verticalId
        ? await prisma.vertical.findUnique({ where: { id: verticalId }, select: { id: true } }).catch(() => null)
        : await prisma.vertical.findFirst({ where: { isActive: true }, select: { id: true } }).catch(() => null);

      if (vertical && brief) {
        const publicationFormat = publicationType === 'STRATEGIC_REPORT' ? 'STRATEGIC_REPORT' : 'RESEARCH_BRIEF';
        const trustScore = result.stats?.criticalLoop?.finalScore || 0;
        const qualityScore = result.stats?.rank?.avgQuality || 0;
        const citationIntegrity = (result.stats as any)?.citationVerifier?.integrity ?? (result.stats as any)?.citationVerifier?.overallIntegrity;
        const citationCoverage = citationIntegrity ? citationIntegrity / 100 : 0;
        const wordCount = Math.round(brief.html.length / 6);
        const sourceIds = brief.sources || [];
        const readiness = evaluatePublicationReadiness({
          type: publicationFormat,
          trustScore,
          qualityScore,
          citationCoverage,
          wordCount,
          sourceIds,
        });

        const pub = await prisma.thinkTankPublication.create({
          data: {
            verticalId: vertical.id,
            type: publicationFormat,
            title: brief.question || question.trim(),
            html: brief.html,
            wordCount,
            trustScore,
            qualityScore,
            citationCoverage,
            claimCount: 0,
            factClaimCount: 0,
            citedClaimCount: 0,
            sourceIds,
            status: readiness.ok ? 'PUBLISHED' : 'HELD',
            publishedAt: readiness.ok ? new Date() : null,
            criticalLoopResult: { briefId: result.briefId, question, stats: result.stats as any, publicationReadiness: readiness },
          },
        }).catch(() => null);
        publicationId = pub?.id ?? null;
      }
    }

    return NextResponse.json({
      success: true,
      message: publicationId ? "Analysis complete" : "Analysis complete (pipeline ran, publication pending)",
      publicationId,
      briefId: result.briefId,
      quota: {
        used: subscription.studioUsed + 1,
        limit: subscription.studioLimit,
        remaining: subscription.studioLimit - subscription.studioUsed - 1,
      },
      stats: result.stats,
    });

  } catch (error) {
    console.error('[API/Studio/Analyze] Error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/studio/quota
 * 
 * Returns current studio quota for STRATEGY users
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.email },
      include: { subscription: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const subscription = user.subscription;

    // Return quota info (even for non-STRATEGY users for UI)
    return NextResponse.json({
      plan: subscription?.plan || 'none',
      canAccessStudio: subscription?.plan === 'STRATEGY',
      studioQuestionsPerMonth: subscription?.studioQuestionsPerMonth || 0,
      studioQuestionsUsed: subscription?.studioQuestionsUsed || 0,
      studioQuestionsRemaining: Math.max(0, (subscription?.studioQuestionsPerMonth || 0) - (subscription?.studioQuestionsUsed || 0)),
      lastStudioReset: subscription?.lastStudioReset,
    });

  } catch (error) {
    console.error('[API/Studio/Quota] Error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
