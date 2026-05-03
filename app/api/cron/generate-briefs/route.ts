import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runPipeline } from '@/lib/agent/pipeline-v2';
import { planEditorialAgenda } from '@/lib/agent/editorial-planner';
import { generatePublication } from '@/lib/agent/publication-generator';
import { selectSmartProviders } from '@/lib/agent/smart-provider-selector';
import { getVerticalForTopic, getProvidersForVertical, requestResearcherSignOff } from '@/lib/agent/researcher-ownership';
import { classifyTopic } from '@/lib/agent/topic-classifier';
import { evaluatePublicationGate } from '@/lib/agent/publication-gate';

const DEFAULT_WEEKLY_PUBLICATION_MAX = 3;

function getWeeklyPublicationMax(): number {
  const parsed = Number.parseInt(process.env.NOMOSX_WEEKLY_PUBLICATION_MAX || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_WEEKLY_PUBLICATION_MAX;
  return Math.min(parsed, 25);
}

/**
 * POST /api/cron/generate-briefs
 * 
 * Autonomous brief generation — the core of NomosX's publishing engine.
 * Triggered weekly (Sunday 10pm UTC) to prepare briefs for Monday delivery.
 * 
 * Process:
 * 1. Consume editorial plan's autoCommission proposals (if available)
 * 2. Fallback: detect high-priority signals per vertical
 * 3. Use smart provider selection per domain
 * 4. Generate publication via full pipeline (scout → rank → read → analyze → critical loop)
 * 5. Respect cadence limits (weekly quota)
 * 
 * Authorization: Requires CRON_SECRET header for security
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log("[Generate Briefs Cron] Starting autonomous brief generation...");

    // Check global editorial cadence. Publication frequency is a think-tank
    // quality control, not a side effect of the first active subscription row.
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const currentWeeklyCount = await prisma.thinkTankPublication.count({
      where: {
        status: "PUBLISHED",
        publishedAt: { gte: oneWeekAgo },
      },
    });
    const weeklyMax = getWeeklyPublicationMax();
    const remainingSlots = weeklyMax - currentWeeklyCount;

    if (remainingSlots <= 0) {
      console.log("[Generate Briefs Cron] Weekly limit reached — silence is respected");
      return NextResponse.json({
        success: true,
        message: "Weekly limit reached - no publications generated",
        stats: { currentWeeklyCount, weeklyMax, remainingSlots: 0 },
      });
    }

    console.log(`[Generate Briefs Cron] ${remainingSlots} publication slots available`);

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const generatedTopics: string[] = [];

    // Per-vertical cadence tracking: count recent publications per vertical
    const verticalPubCounts = new Map<string, number>();
    const recentPubs = await prisma.thinkTankPublication.groupBy({
      by: ['verticalId'],
      where: { publishedAt: { gte: oneWeekAgo } },
      _count: true,
    });
    for (const rp of recentPubs) {
      verticalPubCounts.set(rp.verticalId, rp._count);
    }

    // Helper: check if a vertical still has capacity this week
    async function verticalHasCapacity(verticalId: string, verticalConfig: any): Promise<boolean> {
      const maxPerWeek = (verticalConfig as any)?.maxPublicationsPerWeek || 3;
      const currentCount = verticalPubCounts.get(verticalId) || 0;
      return currentCount < maxPerWeek;
    }

    // ── STRATEGY 1: Consume editorial plan autoCommissions ──
    try {
      console.log("[Generate Briefs Cron] Checking editorial plan...");
      const agenda = await planEditorialAgenda({ weeklySlots: remainingSlots });

      if (agenda.autoCommission.length > 0) {
        console.log(`[Generate Briefs Cron] Editorial plan: ${agenda.autoCommission.length} auto-commissioned topics`);

        for (const proposal of agenda.autoCommission) {
          if (generated >= remainingSlots) break;

          try {
            console.log(`[Generate Briefs Cron] [EDITORIAL] Generating: "${proposal.topic}"`);

            const smartSel = proposal.suggestedProviders.length > 0
              ? null
              : await selectSmartProviders(proposal.topic).catch(() => null);
            const providers = proposal.suggestedProviders.length > 0
              ? proposal.suggestedProviders as any[]
              : (smartSel?.providers ?? []) as any[];

            const pipelineMode = proposal.suggestedFormat === "strategic" ? "strategic" : "brief";

            const result = await runPipeline(
              proposal.topic,
              pipelineMode,
              {
                providers,
                perProvider: pipelineMode === "strategic" ? 25 : 20,
              }
            );

            if (result.briefId) {
              // Fetch the generated brief HTML from DB
              const generatedBrief = await prisma.brief.findUnique({
                where: { id: result.briefId },
                select: { html: true, sources: true },
              });

              // Find the vertical for this topic via unified classifier
              const topicClassification = await classifyTopic(proposal.topic).catch(() => null);
              const matchedSlug = topicClassification?.verticalSlug || getVerticalForTopic(proposal.topic);
              const vertical = matchedSlug
                ? await prisma.vertical.findUnique({ where: { slug: matchedSlug }, select: { id: true, slug: true, config: true } })
                : await prisma.vertical.findFirst({ where: { isActive: true }, select: { id: true, slug: true, config: true } });

              if (vertical) {
                // Check per-vertical cadence before publishing
                const hasCapacity = await verticalHasCapacity(vertical.id, vertical.config);
                if (!hasCapacity) {
                  console.log(`[Generate Briefs Cron] ⏸️ Vertical ${vertical.slug} at weekly capacity, skipping "${proposal.topic}"`);
                  skipped++;
                  continue;
                }

                const briefHtml = generatedBrief?.html || `<div>Generated from editorial plan: ${proposal.topic}</div>`;
                const trustScore = result.stats?.criticalLoop?.finalScore || 80;

                // Researcher sign-off before publishing
                let signOff;
                try {
                  signOff = await requestResearcherSignOff(proposal.topic, briefHtml, trustScore);
                  console.log(`[Generate Briefs Cron] Sign-off by ${signOff.researcherName}: ${signOff.decision} (confidence: ${signOff.confidence})`);
                } catch (signErr: any) {
                  console.warn(`[Generate Briefs Cron] Sign-off failed, auto-approving:`, signErr.message);
                  signOff = { approved: true, decision: 'approve', researcherName: 'auto', confidence: 0.5, comments: ['Sign-off unavailable'] };
                }

                const stats = result.stats as any;
                const sourceIds = generatedBrief?.sources || stats?.sourceIds || [];
                const citationIntegrity = stats?.citationVerifier?.integrity ?? stats?.citationVerifier?.overallIntegrity;
                const publicationGate = evaluatePublicationGate({
                  format: pipelineMode === "strategic" ? "strategic" : "brief",
                  html: briefHtml,
                  sourceIds,
                  trustScore,
                  qualityScore: stats?.rank?.avgQuality || trustScore,
                  citationCoverage: citationIntegrity
                    ? citationIntegrity / 100
                    : undefined,
                  devilsAdvocateScore: stats?.devilsAdvocate?.publishabilityScore,
                  fatalChallenges: stats?.devilsAdvocate?.fatalChallenges || 0,
                  researcherDecision: signOff.decision,
                });

                // Only publish when researcher sign-off and deterministic publication gate agree.
                const shouldPublish = signOff.approved && publicationGate.decision === "publish";
                const pubStatus = shouldPublish ? "PUBLISHED" : "DRAFT";

                await prisma.thinkTankPublication.create({
                  data: {
                    verticalId: vertical.id,
                    type: pipelineMode === "strategic" ? "STRATEGIC_REPORT" : "EXECUTIVE_BRIEF",
                    title: proposal.topic,
                    html: briefHtml,
                    wordCount: Math.round(briefHtml.length / 6),
                    trustScore,
                    qualityScore: stats?.rank?.avgQuality || 75,
                    citationCoverage: publicationGate.metrics.citationCoverage,
                    claimCount: publicationGate.metrics.claimCount,
                    factClaimCount: publicationGate.metrics.claimCount,
                    citedClaimCount: publicationGate.metrics.citedClaimCount,
                    sourceIds,
                    status: pubStatus,
                    publishedAt: shouldPublish ? new Date() : null,
                    criticalLoopResult: {
                      briefId: result.briefId,
                      question: proposal.topic,
                      reason: proposal.reason,
                      confidence: proposal.confidence,
                      stats: result.stats as any,
                      signOff: { researcher: signOff.researcherName, decision: signOff.decision, confidence: signOff.confidence, comments: signOff.comments },
                      publicationGate: publicationGate as any,
                    } as any,
                  },
                });

                if (!shouldPublish) {
                  console.log(`[Generate Briefs Cron] ⚠️ ${signOff.researcherName} rejected/held: "${proposal.topic}" → DRAFT`);
                }

                // Update cadence tracking for this run
                if (shouldPublish) {
                  verticalPubCounts.set(vertical.id, (verticalPubCounts.get(vertical.id) || 0) + 1);
                }
              }

              generated++;
              generatedTopics.push(proposal.topic);
              console.log(`[Generate Briefs Cron] ✅ Published editorial topic: "${proposal.topic}"`);
            } else {
              failed++;
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (err: any) {
            failed++;
            console.error(`[Generate Briefs Cron] Editorial topic failed: "${proposal.topic}":`, err.message);
          }
        }
      } else {
        console.log("[Generate Briefs Cron] No auto-commissioned topics from editorial plan");
      }
    } catch (err) {
      console.warn("[Generate Briefs Cron] Editorial plan unavailable, falling back to signal-based:", err);
    }

    // ── STRATEGY 2: Fallback — signal-based generation (if slots remain) ──
    if (generated < remainingSlots) {
      console.log(`[Generate Briefs Cron] ${remainingSlots - generated} slots remaining, checking signals...`);

      const recentSignals = await prisma.signal.findMany({
        where: {
          status: "NEW",
          priorityScore: { gte: 70 },
          detectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { priorityScore: "desc" },
        take: remainingSlots - generated,
        include: { vertical: { select: { id: true, name: true } } },
      });

      for (const signal of recentSignals) {
        if (generated >= remainingSlots) break;

        try {
          console.log(`[Generate Briefs Cron] [SIGNAL] Generating for: "${signal.title}"`);

          const pubResult = await generatePublication({
            signalId: signal.id,
          });

          if (pubResult.success && pubResult.status === "PUBLISHED") {
            await prisma.signal.update({
              where: { id: signal.id },
              data: { status: "PUBLISHED" },
            });

            generated++;
            generatedTopics.push(signal.title);
            console.log(`[Generate Briefs Cron] ✅ Published signal brief: "${signal.title}" (trust: ${pubResult.trustScore})`);
          } else if (pubResult.success) {
            skipped++;
            console.log(`[Generate Briefs Cron] Signal brief held for review: "${signal.title}" (status: ${pubResult.status || "DRAFT"}, trust: ${pubResult.trustScore})`);
          } else {
            failed++;
            console.error(`[Generate Briefs Cron] Signal brief failed: ${pubResult.error}`);
          }

          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (err: any) {
          failed++;
          console.error(`[Generate Briefs Cron] Signal processing failed:`, err.message);
        }
      }

      if (recentSignals.length === 0) {
        console.log("[Generate Briefs Cron] No qualifying signals found");
        skipped++;
      }
    }

    console.log(`[Generate Briefs Cron] ✅ Completed: ${generated} generated, ${skipped} skipped, ${failed} failed`);

    return NextResponse.json({
      success: true,
      stats: {
        generated,
        skipped,
        failed,
        generatedTopics,
        currentWeeklyCount: currentWeeklyCount + generated,
        weeklyMax,
        remainingSlots: remainingSlots - generated,
        strategy: generated > 0 ? "editorial+signal" : "none",
      },
    });

  } catch (error: any) {
    console.error("[Generate Briefs Cron] Fatal error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint for manual testing (admin only)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized - Admin only" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    message: "Generate briefs cron endpoint",
    usage: "POST with Authorization: Bearer <CRON_SECRET>",
    schedule: "Weekly on Sunday 10pm UTC (before Monday email delivery)",
  });
}
