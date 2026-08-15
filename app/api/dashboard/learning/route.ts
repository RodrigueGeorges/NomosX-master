import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/dashboard/learning
 *
 * Tableau de bord de l'apprentissage du système.
 * Affiche :
 * - Leçons apprises (auto + humaines) avec taux de succès
 * - Corrections humaines récentes
 * - Self-correction stats (combien de retries, améliorations)
 * - Calibration des agents (trust score moyen par agent)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 1. Leçons apprises
    const lessons = await prisma.agentAuditLog.findMany({
      where: {
        action: 'LESSON_LEARNED',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const parsedLessons = lessons.map(l => {
      try {
        const m = JSON.parse(l.metadata || '{}');
        return {
          id: l.id,
          agent: l.agent,
          lesson: m.lesson || '',
          category: m.category || 'general',
          severity: m.severity || 'medium',
          source: m.source || 'auto',
          successRate: m.successRate || 0.5,
          weight: m.weight || 0.5,
          appliedCount: m.appliedCount || 0,
          timestamp: l.timestamp.toISOString(),
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // 2. Corrections humaines
    const corrections = await prisma.agentAuditLog.findMany({
      where: {
        action: 'HUMAN_CORRECTION',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    const parsedCorrections = corrections.map(c => {
      try {
        const m = JSON.parse(c.metadata || '{}');
        return {
          id: c.id,
          agent: c.agent,
          section: m.section || '',
          correctionType: m.correctionType || 'other',
          comment: m.comment || '',
          timestamp: c.timestamp.toISOString(),
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // 3. Self-correction stats (from pipeline runs)
    const selfCorrections = await prisma.agentAuditLog.findMany({
      where: {
        action: 'SELF_CORRECTION',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    const parsedSelfCorrections = selfCorrections.map(s => {
      try {
        const m = JSON.parse(s.metadata || '{}');
        return {
          id: s.id,
          agent: s.agent,
          phase: m.phase || '',
          originalScore: m.originalScore || 0,
          finalScore: m.finalScore || 0,
          retries: m.retries || 0,
          improved: m.improved || false,
          timestamp: s.timestamp.toISOString(),
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // 4. Stats agrégées
    const humanLessons = parsedLessons.filter((l: any) => l.source === 'HUMAN_CORRECTION');
    const autoLessons = parsedLessons.filter((l: any) => l.source === 'auto');
    const improvedSelfCorrections = parsedSelfCorrections.filter((s: any) => s.improved);

    // By agent breakdown
    const byAgent: Record<string, { lessons: number; corrections: number; selfCorrections: number; avgSuccessRate: number }> = {};
    for (const l of parsedLessons as any[]) {
      if (!byAgent[l.agent]) byAgent[l.agent] = { lessons: 0, corrections: 0, selfCorrections: 0, avgSuccessRate: 0 };
      byAgent[l.agent].lessons++;
      byAgent[l.agent].avgSuccessRate += l.successRate;
    }
    for (const c of parsedCorrections as any[]) {
      if (!byAgent[c.agent]) byAgent[c.agent] = { lessons: 0, corrections: 0, selfCorrections: 0, avgSuccessRate: 0 };
      byAgent[c.agent].corrections++;
    }
    for (const s of parsedSelfCorrections as any[]) {
      if (!byAgent[s.agent]) byAgent[s.agent] = { lessons: 0, corrections: 0, selfCorrections: 0, avgSuccessRate: 0 };
      byAgent[s.agent].selfCorrections++;
    }
    for (const agent of Object.keys(byAgent)) {
      const count = byAgent[agent].lessons;
      byAgent[agent].avgSuccessRate = count > 0 ? byAgent[agent].avgSuccessRate / count : 0;
    }

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      summary: {
        totalLessons: parsedLessons.length,
        humanLessons: humanLessons.length,
        autoLessons: autoLessons.length,
        totalCorrections: parsedCorrections.length,
        totalSelfCorrections: parsedSelfCorrections.length,
        selfCorrectionImprovementRate: parsedSelfCorrections.length > 0
          ? improvedSelfCorrections.length / parsedSelfCorrections.length
          : 0,
      },
      byAgent,
      lessons: parsedLessons.slice(0, 20),
      corrections: parsedCorrections.slice(0, 10),
      selfCorrections: parsedSelfCorrections.slice(0, 10),
    });
  } catch (error: unknown) {
    console.error('[API/Dashboard/Learning] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch learning dashboard data' },
      { status: 500 }
    );
  }
}
