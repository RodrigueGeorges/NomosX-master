/**
 * TEST ONLY — /api/test/pipeline
 * Protected by CRON_SECRET. Runs a pipeline (brief or strategic) and returns detailed results.
 * GET: Check recent pipeline runs + briefs (diagnostic)
 * POST: Run a pipeline
 * Not for production use — delete after validation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/lib/agent/pipeline-v2';
import type { ReportFormat } from '@/lib/agent/pipeline-v2';
import { prisma } from '@/lib/db';

export const maxDuration = 600;

// GET: Diagnostic — check recent pipeline runs and briefs
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [runs, briefs, publications, signals, sources, verticals, agentLogs] = await Promise.all([
    prisma.pipelineRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, status: true, question: true, format: true,
        durationMs: true, sourcesFound: true, sourcesRanked: true,
        sourcesUsed: true, trustScore: true, totalCostUsd: true,
        createdAt: true, finishedAt: true, steps: true,
      },
    }),
    prisma.brief.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, kind: true, question: true, createdAt: true,
      },
    }).then(bs => bs.map(b => ({ ...b }))),
    prisma.thinkTankPublication.count({ where: { status: 'PUBLISHED' } }),
    // Signals: how many detected, by type
    prisma.signal.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 20,
      select: {
        id: true, signalType: true, title: true, priorityScore: true,
        status: true, sourceIds: true, detectedAt: true,
        vertical: { select: { slug: true, name: true } },
      },
    }),
    // Sources: total count + recent
    prisma.source.count(),
    // Verticals
    prisma.vertical.findMany({
      where: { isActive: true },
      select: { slug: true, name: true, _count: { select: { signals: true, publications: true } } },
    }),
    // Agent audit logs (researcher activity)
    prisma.agentAuditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: { id: true, agent: true, action: true, resource: true, timestamp: true },
    }).catch(() => []),
  ]);

  // Get HTML lengths for recent briefs
  const briefsWithLength = await Promise.all(
    briefs.map(async (b: any) => {
      const full = await prisma.brief.findUnique({ where: { id: b.id }, select: { html: true } });
      return {
        ...b,
        htmlLength: full?.html?.length || 0,
        wordCount: full?.html ? full.html.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length : 0,
        hasCitations: full?.html ? /\[SRC-\d+\]/.test(full.html) : false,
      };
    })
  );

  // Extract pipeline step details from the most recent completed run
  const lastCompleted = runs.find((r: any) => r.status === 'COMPLETED');
  const pipelineSteps = lastCompleted?.steps ? Object.keys(lastCompleted.steps as any).filter(k => k !== 'error') : [];

  return NextResponse.json({
    pipelineRuns: runs,
    recentBriefs: briefsWithLength,
    publishedPublications: publications,
    signals: { total: signals.length, items: signals },
    totalSources: sources,
    verticals: verticals,
    agentActivity: agentLogs,
    pipelineStepsUsed: pipelineSteps,
    lastCompletedRunSteps: lastCompleted?.steps || null,
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { question, format = 'brief' } = await req.json();

    if (!question || question.length < 3) {
      return NextResponse.json({ error: 'Question too short' }, { status: 400 });
    }

    const validFormats: ReportFormat[] = ['brief', 'strategic', 'dossier'];
    if (!validFormats.includes(format as ReportFormat)) {
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    console.log(`[TEST PIPELINE] Running ${format} for: "${question}"`);
    const startTime = Date.now();

    const result = await runPipeline(question, format, {
      providers: ['openalex', 'crossref', 'semanticscholar'],
      perProvider: 15,
    });

    const duration = Date.now() - startTime;

    // Fetch the generated brief HTML from DB
    let htmlLength = 0;
    let htmlPreview = '';
    let hasHtml = false;
    let hasCitations = false;
    let citationCount = 0;
    let wordCount = 0;

    if (result.briefId) {
      const brief = await prisma.brief.findUnique({
        where: { id: result.briefId },
        select: { html: true },
      });
      if (brief?.html) {
        htmlLength = brief.html.length;
        htmlPreview = brief.html.slice(0, 800);
        hasHtml = brief.html.length > 100;
        const citations = brief.html.match(/\[SRC-\d+\]/g) || [];
        hasCitations = citations.length > 0;
        citationCount = new Set(citations).size;
        wordCount = brief.html.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
      }
    }

    return NextResponse.json({
      success: true,
      format,
      question,
      duration: `${Math.round(duration / 1000)}s`,
      durationMs: duration,
      briefId: result.briefId,
      pipelineRunId: result.pipelineRunId,
      stats: result.stats,
      htmlLength,
      htmlPreview,
      hasHtml,
      hasCitations,
      citationCount,
      wordCount,
    });
  } catch (error: any) {
    console.error('[TEST PIPELINE] Error:', error);
    return NextResponse.json({
      error: 'Pipeline failed',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    }, { status: 500 });
  }
}
