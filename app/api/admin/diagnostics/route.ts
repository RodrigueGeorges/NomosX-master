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

const num = (v: unknown) => (typeof v === 'number' ? v : null);

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-admin-key') ?? req.nextUrl.searchParams.get('key');
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const hours = Math.min(Number(req.nextUrl.searchParams.get('hours') ?? 48) || 48, 24 * 30);
  const since = new Date(Date.now() - hours * 3600_000);

  const [publications, pipelineRuns, signals, decisions] = await Promise.all([
    prisma.thinkTankPublication.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true, title: true, type: true, status: true, language: true,
        trustScore: true, qualityScore: true, wordCount: true,
        createdAt: true, publishedAt: true,
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
        trustScore: true, qualityScore: true, error: true,
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
  ]);

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

  return NextResponse.json({
    windowHours: hours,
    generatedAt: new Date().toISOString(),
    publications: {
      count: publications.length,
      byStatus: pubByStatus,
      byVerticalLangStatus: pubByVerticalLang,
      items: publications.map(p => ({
        ...p,
        title: p.title.slice(0, 140),
        vertical: p.vertical.slug,
      })),
    },
    pipelineRuns: {
      count: pipelineRuns.length,
      totalCostUsd: Math.round(runCost * 10000) / 10000,
      totalHours: Math.round(runHours * 100) / 100,
      byStatus: pipelineRuns.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {} as Record<string, number>),
      items: pipelineRuns.map(r => ({
        ...r,
        question: r.question.slice(0, 140),
        durationMin: Math.round((r.durationMs || 0) / 6000) / 10,
        costUsd: Math.round((r.totalCostUsd || 0) * 10000) / 10000,
        error: r.error?.slice(0, 200),
      })),
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
    editorialDecisions: decisions.map(d => ({
      ...d,
      reasons: (d.reasons || []).slice(0, 5),
      signalTitle: d.signal?.title?.slice(0, 100),
      vertical: d.vertical.slug,
    })),
  });
}
