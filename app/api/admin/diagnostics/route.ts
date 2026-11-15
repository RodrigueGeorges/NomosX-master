/**
 * GET /api/admin/diagnostics — run-level observability for the think-tank
 * pipeline. ADMIN_KEY-guarded. Returns recent publications (with gate
 * outcomes), pipeline runs (cost/duration/sources/trust), and signals so a
 * human can tell "held because weak" from "held because broken" without DB
 * access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-admin-key') ?? req.nextUrl.searchParams.get('key');
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const hours = Math.min(Number(req.nextUrl.searchParams.get('hours') ?? 48) || 48, 24 * 30);
  const since = new Date(Date.now() - hours * 3600_000);
  // SLI window is fixed at 7d — distributions need a stable sample, not the
  // ad-hoc `hours` slice used for the item lists.
  const sliSince = new Date(Date.now() - 7 * 24 * 3600_000);

  const percentile = (vals: number[], p: number): number | null => {
    if (vals.length === 0) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  };

  const [publications, pipelineRuns, signals, decisions, costLogs, jobs, deadLetters, sliRuns, sliPubs] = await Promise.all([
    prisma.thinkTankPublication.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true, title: true, type: true, status: true, language: true,
        trustScore: true, qualityScore: true, wordCount: true,
        createdAt: true, publishedAt: true, criticalLoopResult: true,
        vertical: { select: { slug: true } },
      },
    }),
    prisma.pipelineRun.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true, question: true, format: true, status: true,
        totalCostUsd: true, durationMs: true,
        sourcesFound: true, sourcesRanked: true, sourcesUsed: true,
        trustScore: true, qualityScore: true, error: true, steps: true,
        startedAt: true, finishedAt: true,
      },
    }),
    prisma.signal.findMany({
      where: { detectedAt: { gte: since } },
      orderBy: { detectedAt: 'desc' },
      take: 25,
      select: {
        id: true, title: true, status: true, priorityScore: true,
        signalType: true, detectedAt: true, expiresAt: true,
        vertical: { select: { slug: true } },
      },
    }),
    prisma.editorialDecision.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true, decision: true, reasons: true, trustScore: true,
        createdAt: true,
        vertical: { select: { slug: true } },
        signal: { select: { title: true } },
      },
    }),
    prisma.costLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: {
        operation: true, provider: true, model: true,
        costUsd: true, tokensTotal: true, createdAt: true,
      },
    }),
    // Durable job queue — is the worker alive? stuck PENDING/RUNNING jobs
    // explain "signal detected but nothing happens".
    prisma.job.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, type: true, status: true, attempts: true, reclaims: true,
        lastError: true, correlationId: true, createdAt: true,
        startedAt: true, finishedAt: true, lockedUntil: true,
      },
    }),
    prisma.jobDeadLetter.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, originalJobId: true, type: true, failureReason: true, attempts: true, createdAt: true },
    }).catch(() => []),
    // SLI aggregates — wider select, numeric fields only.
    prisma.pipelineRun.findMany({
      where: { createdAt: { gte: sliSince } },
      select: {
        status: true, totalCostUsd: true, durationMs: true,
        trustScore: true, qualityScore: true,
        sourcesFound: true, sourcesRanked: true, sourcesUsed: true,
      },
    }),
    prisma.thinkTankPublication.findMany({
      where: { createdAt: { gte: sliSince } },
      select: { status: true, trustScore: true, qualityScore: true, criticalLoopResult: true },
    }),
  ]);

  // Provider/model spend breakdown — reveals which models actually served
  // the runs (GLM vs freepool fallback) and where the budget went.
  const costByProvider: Record<string, { calls: number; costUsd: number; tokens: number }> = {};
  const costByOperation: Record<string, { calls: number; costUsd: number }> = {};
  for (const c of costLogs) {
    const pk = `${c.provider}/${c.model ?? '?'}`;
    costByProvider[pk] = costByProvider[pk] ?? { calls: 0, costUsd: 0, tokens: 0 };
    costByProvider[pk].calls++;
    costByProvider[pk].costUsd += c.costUsd || 0;
    costByProvider[pk].tokens += c.tokensTotal || 0;
    costByOperation[c.operation] = costByOperation[c.operation] ?? { calls: 0, costUsd: 0 };
    costByOperation[c.operation].calls++;
    costByOperation[c.operation].costUsd += c.costUsd || 0;
  }
  for (const k of Object.keys(costByProvider)) {
    costByProvider[k].costUsd = Math.round(costByProvider[k].costUsd * 10000) / 10000;
  }
  for (const k of Object.keys(costByOperation)) {
    costByOperation[k].costUsd = Math.round(costByOperation[k].costUsd * 10000) / 10000;
  }

  // Aggregate gate outcomes so "tokens burned, nothing published" is visible.
  const pubByStatus: Record<string, number> = {};
  const pubByVerticalLang: Record<string, number> = {};
  for (const p of publications) {
    pubByStatus[p.status] = (pubByStatus[p.status] ?? 0) + 1;
    const k = `${p.vertical.slug}:${p.language ?? '?'}:${p.status}`;
    pubByVerticalLang[k] = (pubByVerticalLang[k] ?? 0) + 1;
  }
  const runCost = pipelineRuns.reduce((a, r) => a + (r.totalCostUsd || 0), 0);
  const runHours = pipelineRuns.reduce((a, r) => a + (r.durationMs || 0), 0) / 3600_000;

  // ── SLI section (7d window) ──────────────────────────────────────────────
  // Agent-SRE style indicators: what "normal" looks like, so drift is visible.
  const completedRuns = sliRuns.filter(r => r.status === 'COMPLETED' || r.status === 'DONE');
  const trustVals = sliRuns.map(r => r.trustScore).filter((v): v is number => typeof v === 'number');
  const qualityVals = sliRuns.map(r => r.qualityScore).filter((v): v is number => typeof v === 'number');
  const costVals = completedRuns.map(r => r.totalCostUsd ?? 0);
  const durVals = completedRuns.map(r => r.durationMs ?? 0);
  const gateFailHistogram: Record<string, number> = {};
  let heldCount = 0;
  let publishedCount = 0;
  for (const p of sliPubs) {
    if (p.status === 'HELD') heldCount++;
    if (p.status === 'PUBLISHED') publishedCount++;
    const checks: any[] = (p.criticalLoopResult as any)?.publicationGate?.checks ?? [];
    for (const c of checks) {
      if (c && c.passed === false) {
        const k = String(c.checkType ?? c.name ?? 'unknown');
        gateFailHistogram[k] = (gateFailHistogram[k] ?? 0) + 1;
      }
    }
  }
  const funnel = {
    sourcesFound_p50: percentile(sliRuns.map(r => r.sourcesFound ?? 0).filter(v => v > 0), 50),
    sourcesRanked_p50: percentile(sliRuns.map(r => r.sourcesRanked ?? 0).filter(v => v > 0), 50),
    sourcesUsed_p50: percentile(sliRuns.map(r => r.sourcesUsed ?? 0).filter(v => v > 0), 50),
  };

  return NextResponse.json({
    windowHours: hours,
    generatedAt: new Date().toISOString(),
    publications: {
      count: publications.length,
      byStatus: pubByStatus,
      byVerticalLangStatus: pubByVerticalLang,
      items: publications.map(p => {
        // Extract gate verdict detail from criticalLoopResult — the "why
        // HELD" answer lives in publicationGate.checks + DA verdict.
        const clr: any = p.criticalLoopResult ?? {};
        const gate: any = clr.publicationGate ?? {};
        const checks: any[] = Array.isArray(gate.checks) ? gate.checks : [];
        return {
          id: p.id, title: p.title.slice(0, 140), type: p.type, status: p.status,
          language: p.language, trustScore: p.trustScore, qualityScore: p.qualityScore,
          wordCount: p.wordCount, createdAt: p.createdAt, publishedAt: p.publishedAt,
          vertical: p.vertical.slug,
          gate: {
            decision: gate.decision ?? null,
            failedChecks: checks.filter(c => c && c.passed === false).map(c => `${c.checkType ?? c.name}:${(c.score ?? c.details ?? '').toString().slice(0, 110)}`),
            checkScores: checks.filter(c => c && typeof c.score === 'number').map(c => `${c.checkType ?? c.name}=${c.score}`).slice(0, 12),
          },
          devilsAdvocate: clr.devilsAdvocateVerdict
            ? { verdict: clr.devilsAdvocateVerdict.verdict ?? clr.devilsAdvocateVerdict.decision ?? null, publishability: clr.devilsAdvocateVerdict.publishabilityScore ?? null }
            : null,
        };
      }),
    },
    pipelineRuns: {
      count: pipelineRuns.length,
      totalCostUsd: Math.round(runCost * 10000) / 10000,
      totalHours: Math.round(runHours * 100) / 100,
      byStatus: pipelineRuns.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {} as Record<string, number>),
      items: pipelineRuns.map(r => {
        // Step-level breakdown — where the run spent time/cost and where it
        // died. steps is a JSON array of {name,status,durationMs,costUsd}.
        const steps: any[] = Array.isArray((r as any).steps) ? (r as any).steps : [];
        const stepSummary = steps.map((s: any) => ({
          name: s.name ?? s.step ?? '?',
          status: s.status ?? '?',
          min: s.durationMs ? Math.round(s.durationMs / 6000) / 10 : null,
          cost: typeof s.costUsd === 'number' ? Math.round(s.costUsd * 10000) / 10000 : null,
          error: s.error ? String(s.error).slice(0, 120) : undefined,
        }));
        const failedSteps = stepSummary.filter(s => s.status === 'failed' || s.status === 'error');
        return {
          id: r.id, question: r.question.slice(0, 140), format: r.format, status: r.status,
          totalCostUsd: r.totalCostUsd, durationMs: r.durationMs,
          sourcesFound: r.sourcesFound, sourcesRanked: r.sourcesRanked, sourcesUsed: r.sourcesUsed,
          trustScore: r.trustScore, qualityScore: r.qualityScore, error: r.error?.slice(0, 200),
          startedAt: r.startedAt, finishedAt: r.finishedAt,
          durationMin: Math.round((r.durationMs || 0) / 6000) / 10,
          costUsd: Math.round((r.totalCostUsd || 0) * 10000) / 10000,
          steps: stepSummary.slice(0, 40),
          failedSteps,
          zombie: r.status === 'RUNNING' && r.startedAt && (Date.now() - new Date(r.startedAt).getTime()) > 3 * 3600_000,
        };
      }),
    },
    signals: {
      count: signals.length,
      byStatus: signals.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] ?? 0) + 1 }), {} as Record<string, number>),
      items: signals.map(s => ({
        ...s,
        title: s.title.slice(0, 120),
        vertical: s.vertical.slug,
      })),
    },
    jobQueue: {
      total: jobs.length,
      byStatus: jobs.reduce((a, j) => ({ ...a, [j.status]: (a[j.status] ?? 0) + 1 }), {} as Record<string, number>),
      stuck: jobs.filter(j =>
        (j.status === 'PENDING' && j.createdAt && (Date.now() - new Date(j.createdAt).getTime()) > 30 * 60_000) ||
        (j.status === 'RUNNING' && j.lockedUntil && new Date(j.lockedUntil).getTime() < Date.now())
      ).map(j => ({ id: j.id, type: j.type, status: j.status, attempts: j.attempts, age: j.createdAt, lastError: j.lastError?.slice(0, 150) })),
      recentFailures: jobs.filter(j => j.status === 'FAILED').slice(0, 10).map(j => ({
        id: j.id, type: j.type, attempts: j.attempts, lastError: j.lastError?.slice(0, 200), createdAt: j.createdAt,
      })),
      deadLetters: deadLetters.map(d => ({ type: d.type, reason: d.failureReason?.slice(0, 200), attempts: d.attempts, at: d.createdAt })),
    },
    health: {
      zombieRuns: pipelineRuns.filter(r => r.status === 'RUNNING' && r.startedAt && (Date.now() - new Date(r.startedAt).getTime()) > 3 * 3600_000)
        .map(r => ({ id: r.id, format: r.format, startedAt: r.startedAt, question: r.question.slice(0, 100) })),
      deadLetterCount: deadLetters.length,
      stuckJobCount: jobs.filter(j =>
        (j.status === 'PENDING' && j.createdAt && (Date.now() - new Date(j.createdAt).getTime()) > 30 * 60_000) ||
        (j.status === 'RUNNING' && j.lockedUntil && new Date(j.lockedUntil).getTime() < Date.now())
      ).length,
    },
    sli: {
      windowDays: 7,
      runs: {
        total: sliRuns.length,
        completed: completedRuns.length,
        trust: {
          n: trustVals.length,
          p50: percentile(trustVals, 50),
          p95: percentile(trustVals, 95),
          min: trustVals.length ? Math.min(...trustVals) : null,
        },
        quality: {
          n: qualityVals.length,
          p50: percentile(qualityVals, 50),
          p95: percentile(qualityVals, 95),
        },
        costUsd: { p50: percentile(costVals, 50), p95: percentile(costVals, 95), max: costVals.length ? Math.max(...costVals) : null },
        durationMin: {
          p50: percentile(durVals.map(d => d / 60000), 50),
          p95: percentile(durVals.map(d => d / 60000), 95),
        },
        funnel,
      },
      publications: {
        total: sliPubs.length,
        published: publishedCount,
        held: heldCount,
        publishRate: sliPubs.length ? Math.round((publishedCount / sliPubs.length) * 1000) / 1000 : null,
      },
      gateFailHistogram,
    },
    llmSpend: {
      totalCostUsd: Math.round(costLogs.reduce((a, c) => a + (c.costUsd || 0), 0) * 10000) / 10000,
      calls: costLogs.length,
      byProvider: costByProvider,
      byOperation: costByOperation,
    },
    editorialDecisions: decisions.map(d => ({
      ...d,
      reasons: (d.reasons || []).slice(0, 5),
      signalTitle: d.signal?.title?.slice(0, 100),
      vertical: d.vertical.slug,
    })),
  });
}
