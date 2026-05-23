import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runAndPublishInquiry } from '@/lib/agent/inquiry-orchestrator';
import { publicationTypeToDepth } from '@/lib/agent/inquiry-funnel-utils';
import { requireStudioTier, hasExceededStudioLimit, createAccessDeniedResponse, createLimitExceededResponse } from '@/lib/middleware/subscription';

/**
 * POST /api/studio/analyze
 *
 * STUDIO tier only endpoint for custom research
 * Checks studio limits and decrements quota
 */
export async function POST(req: NextRequest) {
  try {
    const subscriptionCheck = await requireStudioTier(req);
    if (!subscriptionCheck.allowed) {
      return createAccessDeniedResponse('STUDIO', subscriptionCheck.subscription?.tier);
    }

    if (hasExceededStudioLimit(subscriptionCheck.subscription!)) {
      return createLimitExceededResponse('studio');
    }

    const subscription = subscriptionCheck.subscription!;

    const session = await getSession();
    if (!session?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { question, publicationType = 'EXECUTIVE_BRIEF', verticalId } = body;

    if (!question || question.trim().length < 10) {
      return NextResponse.json({ error: "Question must be at least 10 characters" }, { status: 400 });
    }

    await prisma.subscription.update({
      where: { userId: session.id },
      data: { studioQuestionsUsed: { increment: 1 } },
    });

    const depth = publicationTypeToDepth(publicationType);

    const pub = await runAndPublishInquiry({
      question: question.trim(),
      depth,
      verticalId,
      source: 'studio',
      perProvider: depth === 'strategic' ? 25 : 20,
      minTrustScore: 60,
      metadata: { userId: session.id, publicationType },
    });

    return NextResponse.json({
      success: pub.status !== 'failed',
      message: pub.status === 'failed'
        ? pub.error ?? "Analysis failed"
        : pub.status === 'published'
          ? "Analysis complete"
          : "Analysis complete (held for quality review)",
      publicationId: pub.publicationId ?? null,
      briefId: pub.briefId ?? null,
      publicId: pub.publicId ?? null,
      status: pub.status,
      quota: {
        used: subscription.studioUsed + 1,
        limit: subscription.studioLimit,
        remaining: subscription.studioLimit - subscription.studioUsed - 1,
      },
      stats: pub.pipeline?.stats ?? {},
      trustScore: pub.trustScore,
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
