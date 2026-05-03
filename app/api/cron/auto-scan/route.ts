import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { evaluatePublicationReadiness } from '@/lib/publication-visibility';
import { runPipeline, type ReportFormat } from '@/lib/agent/pipeline-v2';
import { runTopicRadar } from '@/lib/agent/topic-radar';
import { editorialTriage } from '@/lib/agent/editor-in-chief';

/**
 * POST /api/cron/auto-scan
 * 
 * LEAN THINK TANK SCANNER — Editor-in-Chief Architecture.
 * Runs 2x/day (06:00, 18:00 UTC).
 * 
 * 3-PHASE ARCHITECTURE (replaces 545-line brute-force):
 * 
 *   DETECT (30s) → DECIDE (10s) → DELEGATE (3-5min)
 * 
 * 1. DETECT: TopicRadar fast sweep
 *    - GDELT: 5 broad queries (not 28 narrow ones)
 *    - RSS: 8 think tank feeds in parallel
 *    - OpenAlex: trending papers (1 API call)
 *    - DB: existing unprocessed signals
 *    → Top 15 raw breaking topics
 * 
 * 2. DECIDE: Editor-in-Chief LLM triage
 *    - Single gpt-4o-mini call (~$0.001)
 *    - Filters: novelty, urgency, impact, angle, diversity
 *    - Selects 1-3 topics for publication
 *    - Full classification (domain, researchers, providers)
 * 
 * 3. DELEGATE: Targeted pipeline execution
 *    - Brief or strategic based on editorial decision
 *    - Uses classification's recommended providers
 *    - Publishes to ThinkTankPublication
 * 
 * Total: ~5 minutes for 1 brief (was 25+ minutes)
 */

const MAX_PUBLICATIONS_PER_SCAN = 2;

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[AUTO-SCAN] === DETECT → DECIDE → DELEGATE ===");

    const stats = {
      radarTopics: 0,
      editorialDecisions: 0,
      briefsPublished: 0,
      strategicPublished: 0,
      skipped: 0,
      totalCostUsd: 0,
      errors: [] as string[],
      phases: {
        detect: { durationMs: 0, topicsFound: 0 },
        decide: { durationMs: 0, selected: 0, costUsd: 0 },
        delegate: { durationMs: 0, published: 0 },
      },
    };

    // ════════════════════════════════════════════════════════════════
    // PHASE 1: DETECT — TopicRadar fast sweep (~30 seconds)
    // ════════════════════════════════════════════════════════════════

    const detectStart = Date.now();
    console.log("[AUTO-SCAN] Phase 1: DETECT — fast radar sweep...");

    const radarResult = await runTopicRadar({ maxTopics: 15, includeAcademic: true });

    stats.radarTopics = radarResult.topics.length;
    stats.phases.detect = {
      durationMs: Date.now() - detectStart,
      topicsFound: radarResult.topics.length,
    };

    console.log(`[AUTO-SCAN] DETECT complete: ${radarResult.topics.length} topics in ${stats.phases.detect.durationMs}ms`);
    for (const t of radarResult.topics.slice(0, 5)) {
      console.log(`  [${t.sourceType}] (${t.score}) ${t.title.slice(0, 80)}`);
    }

    if (radarResult.topics.length === 0) {
      const durationMs = Date.now() - startTime;
      console.log(`[AUTO-SCAN] No topics detected, scan complete in ${durationMs}ms`);
      return NextResponse.json({
        success: true,
        architecture: 'detect-decide-delegate',
        stats: { ...stats, durationMs, durationMin: durationMs / 60000 },
      });
    }

    // ════════════════════════════════════════════════════════════════
    // PHASE 2: DECIDE — Editor-in-Chief LLM triage (~10 seconds)
    // ════════════════════════════════════════════════════════════════

    const decideStart = Date.now();
    console.log("[AUTO-SCAN] Phase 2: DECIDE — editorial triage...");

    const triageResult = await editorialTriage(radarResult.topics, {
      maxPublications: MAX_PUBLICATIONS_PER_SCAN,
      budgetUsd: 20.0,
    });

    stats.editorialDecisions = triageResult.decisions.length;
    stats.skipped = triageResult.skipped;
    stats.totalCostUsd += triageResult.costUsd;
    stats.phases.decide = {
      durationMs: Date.now() - decideStart,
      selected: triageResult.decisions.length,
      costUsd: triageResult.costUsd,
    };

    console.log(`[AUTO-SCAN] DECIDE complete: ${triageResult.decisions.length} selected in ${stats.phases.decide.durationMs}ms ($${triageResult.costUsd.toFixed(4)})`);
    for (const d of triageResult.decisions) {
      console.log(`  [${d.action}] (P${d.priority}) ${d.topic.title.slice(0, 80)} → ${d.classification.primaryDomain}`);
    }

    if (triageResult.decisions.length === 0) {
      const durationMs = Date.now() - startTime;
      console.log(`[AUTO-SCAN] No publications selected, scan complete in ${(durationMs / 60000).toFixed(1)}min`);
      return NextResponse.json({
        success: true,
        architecture: 'detect-decide-delegate',
        stats: { ...stats, durationMs, durationMin: durationMs / 60000 },
      });
    }

    // ════════════════════════════════════════════════════════════════
    // PHASE 3: DELEGATE — Run targeted pipeline for each decision
    // ════════════════════════════════════════════════════════════════

    const delegateStart = Date.now();
    console.log("[AUTO-SCAN] Phase 3: DELEGATE — running targeted pipelines...");

    for (const decision of triageResult.decisions) {
      try {
        const topic = decision.topic.title;
        // Auto-scan produces strategic reports for think-tank quality depth.
        // Briefs are too shallow for McKinsey/France Stratégie level output.
        const mode: ReportFormat = 'strategic';
        // Merge classified providers + news providers for breaking topics
        const classifiedProviders = decision.classification.providers.slice(0, 4);
        const newsProviders = ['gdelt-news', 'newsapi', 'gnews'];
        const mergedProviders = Array.from(new Set([...classifiedProviders, ...newsProviders])).slice(0, 8);
        const leadResearcher = decision.classification.researchers[0];

        console.log(`[AUTO-SCAN] DELEGATE: [BRIEF] "${topic.slice(0, 60)}" → ${leadResearcher?.profile.name || 'auto'} (${decision.classification.primaryDomain}) [${mergedProviders.length} providers]`);

        const result = await runPipeline(topic, mode, {
          providers: mergedProviders as any,
          perProvider: 15,
        });

        if (result.briefId) {
          const generatedBrief = await prisma.brief.findUnique({
            where: { id: result.briefId },
            select: { html: true, sources: true },
          });

          const vertical = await prisma.vertical.findFirst({
            where: { slug: decision.classification.verticalSlug },
          });

          if (vertical) {
            const briefHtml = generatedBrief?.html || '';
            const trustScore = result.stats?.criticalLoop?.finalScore || 75;

            const publicationType = mode === 'strategic' ? 'STRATEGIC_REPORT' : 'RESEARCH_BRIEF';
            const sourceIds = generatedBrief?.sources || [];
            const wordCount = Math.round(briefHtml.length / 6);
            const qualityScore = result.stats?.rank?.avgQuality || 70;
            const citationIntegrity = (result.stats as any)?.citationVerifier?.integrity ?? (result.stats as any)?.citationVerifier?.overallIntegrity;
            const citationCoverage = citationIntegrity ? citationIntegrity / 100 : 0;
            const readiness = evaluatePublicationReadiness({
              type: publicationType,
              trustScore,
              qualityScore,
              citationCoverage,
              wordCount,
              sourceIds,
            });

            await prisma.thinkTankPublication.create({
              data: {
                verticalId: vertical.id,
                type: publicationType,
                title: topic,
                html: briefHtml,
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
                criticalLoopResult: {
                  architecture: 'detect-decide-delegate',
                  decision: decision.action,
                  reasoning: decision.reasoning,
                  publicationReadiness: readiness,
                  priority: decision.priority,
                  urgency: decision.classification.urgency,
                  leadResearcher: leadResearcher?.profile.name,
                  domain: decision.classification.primaryDomain,
                  isCrossDomain: decision.classification.isCrossDomain,
                  collaborators: decision.classification.researchers.slice(1).map((r: any) => r.profile.name),
                  radarSource: decision.topic.sourceType,
                  radarScore: decision.topic.score,
                  stats: result.stats as any,
                },
              },
            });

            stats.briefsPublished++;

            console.log(`[AUTO-SCAN] DELEGATE: ✅ Published [${mode}]: "${topic.slice(0, 60)}" (trust: ${trustScore}, domain: ${decision.classification.primaryDomain})`);
          }
        }
      } catch (err: any) {
        stats.errors.push(`Delegate "${decision.topic.title.slice(0, 40)}": ${err.message}`);
        console.error(`[AUTO-SCAN] DELEGATE failed:`, err.message);
      }
    }

    stats.phases.delegate = {
      durationMs: Date.now() - delegateStart,
      published: stats.briefsPublished + stats.strategicPublished,
    };

    // ════════════════════════════════════════════════════════════════
    // REPORT
    // ════════════════════════════════════════════════════════════════

    const durationMs = Date.now() - startTime;
    const durationMin = (durationMs / 60000).toFixed(1);

    console.log(`[AUTO-SCAN] ✅ Complete in ${durationMin}min — ${stats.radarTopics} topics → ${stats.editorialDecisions} selected → ${stats.briefsPublished} briefs + ${stats.strategicPublished} strategic ($${stats.totalCostUsd.toFixed(4)})`);

    return NextResponse.json({
      success: true,
      architecture: 'detect-decide-delegate',
      stats: {
        ...stats,
        radar: radarResult.stats,
        editorial: {
          decisions: triageResult.decisions.map(d => ({
            action: d.action,
            topic: d.topic.title.slice(0, 80),
            domain: d.classification.primaryDomain,
            urgency: d.classification.urgency,
            priority: d.priority,
            source: d.topic.sourceType,
            researchers: d.classification.researchers.map((r: any) => r.profile.name),
          })),
        },
        durationMs,
        durationMin: parseFloat(durationMin),
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error("[AUTO-SCAN] Fatal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET endpoint for status check
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 401 });
  }

  const [recentSignals, recentSources, verticals] = await Promise.all([
    prisma.signal.count({
      where: { detectedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.source.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.vertical.findMany({
      where: { isActive: true },
      select: {
        slug: true,
        name: true,
        config: true,
        _count: { select: { signals: true, publications: true } },
      },
    }),
  ]);

  const verticalStatus = verticals.map(v => {
    const config = (v.config as any) || {};
    return {
      slug: v.slug,
      name: v.name,
      lastScannedAt: config.lastScannedAt || null,
      totalSignals: v._count.signals,
      totalPubs: v._count.publications,
    };
  });

  const recentPubs = await prisma.thinkTankPublication.findMany({
    where: { publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    select: { type: true, criticalLoopResult: true },
  });

  return NextResponse.json({
    message: "NomosX Think Tank — DETECT → DECIDE → DELEGATE",
    schedule: "2x/day at 06:00 and 18:00 UTC",
    architecture: "DETECT (TopicRadar 30s) → DECIDE (Editor-in-Chief 10s) → DELEGATE (Pipeline 3-5min)",
    last24h: { signalsDetected: recentSignals, sourcesIngested: recentSources },
    last7d: {
      totalPublications: recentPubs.length,
      byType: {
        briefs: recentPubs.filter(p => p.type === 'EXECUTIVE_BRIEF').length,
        strategic: recentPubs.filter(p => p.type === 'STRATEGIC_REPORT').length,
      },
    },
    verticals: verticalStatus,
  });
}
