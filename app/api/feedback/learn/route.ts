import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { withRateLimit, rateLimitConfigs } from '@/lib/validation';
import { recordHumanCorrection, getCorrectionStats } from '@/lib/agent/human-feedback';

/**
 * POST /api/feedback/learn
 *
 * Soumet une correction humaine qui sera utilisée pour l'apprentissage du système.
 * La correction est enregistrée et une leçon est extraite via LLM, puis stockée
 * pour être injectée dans les futures runs du pipeline.
 *
 * Body: {
 *   briefId: string,
 *   runId?: string,
 *   agentId: string,         // 'analyst', 'reader', 'scout', 'editor'
 *   section: string,          // 'summary', 'consensus', 'debate', etc.
 *   originalText: string,
 *   correctedText: string,
 *   correctionType: 'factual_error' | 'missing_citation' | 'wrong_citation' | 'bias' | 'incomplete' | 'misleading' | 'style' | 'other',
 *   comment?: string
 * }
 */
export async function POST(req: NextRequest) {
  return withRateLimit(
    rateLimitConfigs.api,
    async (req) => {
      try {
        const session = await getSession();
        if (!session?.id) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body = await req.json();
        const {
          briefId,
          runId,
          agentId,
          section,
          originalText,
          correctedText,
          correctionType,
          comment,
        } = body;

        // Validation
        if (!briefId || typeof briefId !== 'string') {
          return NextResponse.json({ error: 'briefId is required' }, { status: 400 });
        }
        if (!agentId || typeof agentId !== 'string') {
          return NextResponse.json({ error: 'agentId is required' }, { status: 400 });
        }
        if (!section || typeof section !== 'string') {
          return NextResponse.json({ error: 'section is required' }, { status: 400 });
        }
        if (!originalText || typeof originalText !== 'string') {
          return NextResponse.json({ error: 'originalText is required' }, { status: 400 });
        }
        if (!correctedText || typeof correctedText !== 'string') {
          return NextResponse.json({ error: 'correctedText is required' }, { status: 400 });
        }

        const validTypes = ['factual_error', 'missing_citation', 'wrong_citation', 'bias', 'incomplete', 'misleading', 'style', 'other'];
        const type = validTypes.includes(correctionType) ? correctionType : 'other';

        const result = await recordHumanCorrection({
          briefId,
          runId,
          agentId,
          section,
          originalText,
          correctedText,
          correctionType: type as any,
          comment,
          userId: session.id,
        });

        return NextResponse.json({
          ok: true,
          lessonStored: result.lessonStored,
          lesson: result.lesson,
          message: result.lessonStored
            ? 'Correction enregistrée et leçon extraite — le système apprend de cette correction'
            : 'Correction enregistrée (extraction de leçon échouée)',
        });
      } catch (error: unknown) {
        console.error('[API/Feedback/Learn] Error:', error);
        return NextResponse.json(
          { error: 'Failed to record correction' },
          { status: 500 }
        );
      }
    }
  )(req);
}

/**
 * GET /api/feedback/learn?days=30
 *
 * Récupère les statistiques de corrections humaines et les leçons extraites.
 * Utilisé par le tableau de bord d'apprentissage.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);

    const stats = await getCorrectionStats({ lookbackDays: days });

    return NextResponse.json(stats);
  } catch (error: unknown) {
    console.error('[API/Feedback/Learn] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch correction stats' },
      { status: 500 }
    );
  }
}
