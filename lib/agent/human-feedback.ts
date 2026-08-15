/**
 * Human Feedback Integration — NomosX
 *
 * Permet aux corrections manuelles de l'utilisateur de nourrir le système
 * d'apprentissage. Avant ce module, quand vous corrigiez un brief manuellement,
 * le système ne le savait pas — il ne pouvait pas apprendre de vos interventions.
 *
 * Architecture :
 * 1. recordHumanCorrection() — enregistre une correction dans AgentAuditLog
 *    avec le type "HUMAN_CORRECTION" + extrait une leçon via LLM
 * 2. getHumanCorrectionsForAgent() — récupère les corrections passées
 *    pour un agent donné, injectées dans buildMemoryInjection()
 * 3. The correction becomes a lesson that future runs will see
 *
 * Pattern : ReMe (ACL 2026) — utility-based refinement with human feedback
 *           ERL (arXiv 2026) — heuristic extraction from experiences
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HumanCorrection {
  briefId: string;
  runId?: string;
  agentId: string; // 'analyst', 'reader', 'scout', 'editor', etc.
  section: string; // 'summary', 'consensus', 'debate', 'evidence', etc.
  originalText: string;
  correctedText: string;
  correctionType: 'factual_error' | 'missing_citation' | 'wrong_citation' | 'bias' | 'incomplete' | 'misleading' | 'style' | 'other';
  comment?: string;
  userId?: string;
}

export interface ExtractedLesson {
  lesson: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  applicableTo: string[]; // agent IDs
}

// ─── Record a human correction ──────────────────────────────────────────────

/**
 * Enregistre une correction humaine et extrait une leçon apprenable.
 * La leçon est stockée dans AgentAuditLog comme "LESSON_LEARNED" et sera
 * injectée dans les futures runs via buildMemoryInjection().
 */
export async function recordHumanCorrection(
  correction: HumanCorrection
): Promise<{ lessonStored: boolean; lesson?: string; costUsd: number }> {
  // 1. Enregistrer la correction brute dans AgentAuditLog
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: correction.agentId,
        action: 'HUMAN_CORRECTION',
        metadata: JSON.stringify({
          briefId: correction.briefId,
          runId: correction.runId,
          section: correction.section,
          correctionType: correction.correctionType,
          originalText: correction.originalText.slice(0, 500),
          correctedText: correction.correctedText.slice(0, 500),
          comment: correction.comment,
          userId: correction.userId,
          timestamp: Date.now(),
        }),
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.warn('[HumanFeedback] Failed to record correction:', err);
    return { lessonStored: false, costUsd: 0 };
  }

  // 2. Extraire une leçon via LLM
  try {
    const lesson = await extractLessonFromCorrection(correction);
    if (lesson) {
      // Stocker comme une leçon apprenable
      await prisma.agentAuditLog.create({
        data: {
          agent: correction.agentId,
          action: 'LESSON_LEARNED',
          metadata: JSON.stringify({
            lesson: lesson.lesson,
            category: lesson.category,
            severity: lesson.severity,
            applicableTo: lesson.applicableTo,
            source: 'HUMAN_CORRECTION',
            briefId: correction.briefId,
            successRate: 0.5, // Initial — sera ajusté par les futures runs
            weight: lesson.severity === 'critical' ? 1.0 : lesson.severity === 'high' ? 0.8 : 0.5,
            timestamp: Date.now(),
          }),
          timestamp: new Date(),
        },
      });

      // Aussi enregistrer pour les agents concernés
      for (const agentId of lesson.applicableTo) {
        if (agentId !== correction.agentId) {
          await prisma.agentAuditLog.create({
            data: {
              agent: agentId,
              action: 'LESSON_LEARNED',
              metadata: JSON.stringify({
                lesson: lesson.lesson,
                category: lesson.category,
                severity: lesson.severity,
                source: 'HUMAN_CORRECTION',
                briefId: correction.briefId,
                successRate: 0.5,
                weight: lesson.severity === 'critical' ? 1.0 : 0.5,
                timestamp: Date.now(),
              }),
              timestamp: new Date(),
            },
          });
        }
      }

      console.log(`[HumanFeedback] Lesson extracted and stored for ${correction.agentId}: "${lesson.lesson.slice(0, 80)}..."`);
      return { lessonStored: true, lesson: lesson.lesson, costUsd: 0.001 };
    }
  } catch (err) {
    console.warn('[HumanFeedback] Lesson extraction failed:', err);
  }

  return { lessonStored: false, costUsd: 0 };
}

// ─── Extract a lesson from a correction via LLM ─────────────────────────────

async function extractLessonFromCorrection(correction: HumanCorrection): Promise<ExtractedLesson | null> {
  const prompt = `You are analyzing a human correction to an AI-generated research analysis. Extract a generalizable lesson that the AI system should learn.

CORRECTION DETAILS:
- Agent: ${correction.agentId}
- Section: ${correction.section}
- Correction type: ${correction.correctionType}
- Comment: ${correction.comment || 'N/A'}

ORIGINAL TEXT (what the AI produced):
${correction.originalText.slice(0, 1000)}

CORRECTED TEXT (what the human changed it to):
${correction.correctedText.slice(0, 1000)}

Extract a generalizable lesson. The lesson should be:
1. Actionable (the AI can apply it in future runs)
2. General (not specific to this one brief)
3. Concrete (not vague advice)

Return JSON:
{
  "lesson": "When writing [section type], always [specific action] because [reason]",
  "category": "citation|factual|bias|completeness|style|methodology",
  "severity": "critical|high|medium|low",
  "applicableTo": ["analyst", "reader"]
}

Examples of good lessons:
- "When citing statistics, always verify the number matches the source exactly — do not round or approximate without stating so"
- "When discussing controversial topics, present both sides before taking a position — do not lead with the conclusion"
- "When a source is from a think tank with known ideological leaning, acknowledge this in the analysis"`;

  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 500,
      task: 'enrichment_reasoner',
    });

    const result = parseJson<ExtractedLesson>(response.content);
    if (result?.lesson && result.lesson.length > 10) {
      return result;
    }
  } catch (err) {
    console.warn('[HumanFeedback] LLM extraction failed:', err);
  }

  // Fallback: generate a simple lesson without LLM
  const fallbackLessons: Record<string, string> = {
    factual_error: `Verify factual accuracy in ${correction.section} — a human corrected a factual error`,
    missing_citation: `Add citations in ${correction.section} — a human found missing citations`,
    wrong_citation: `Verify citation accuracy in ${correction.section} — a human found a misattributed citation`,
    bias: `Address bias in ${correction.section} — a human identified bias`,
    incomplete: `Be more complete in ${correction.section} — a human found the analysis incomplete`,
    misleading: `Avoid misleading framing in ${correction.section} — a human found the presentation misleading`,
    style: `Improve writing style in ${correction.section} — a human made style corrections`,
    other: `Improve ${correction.section} — a human made corrections`,
  };

  return {
    lesson: fallbackLessons[correction.correctionType] || `Improve ${correction.section} quality`,
    category: correction.correctionType,
    severity: correction.correctionType === 'factual_error' || correction.correctionType === 'wrong_citation' ? 'high' : 'medium',
    applicableTo: [correction.agentId],
  };
}

// ─── Get human corrections for an agent (for memory injection) ──────────────

/**
 * Récupère les leçons dérivées des corrections humaines pour un agent donné.
 * Ces leçons sont fusionnées avec les leçons automatiques dans buildMemoryInjection().
 */
export async function getHumanCorrectionLessons(
  agentId: string,
  options: { lookbackDays?: number; maxLessons?: number } = {}
): Promise<Array<{ lesson: string; severity: string; category: string; weight: number }>> {
  const { lookbackDays = 90, maxLessons = 5 } = options;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const lessons = await prisma.agentAuditLog.findMany({
      where: {
        agent: agentId,
        action: 'LESSON_LEARNED',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: maxLessons * 3, // Fetch more, then filter
    });

    // Filter for HUMAN_CORRECTION source and parse
    const parsed = lessons.map(l => {
      try {
        const m = JSON.parse(l.metadata || '{}');
        return {
          lesson: m.lesson || '',
          severity: m.severity || 'medium',
          category: m.category || 'general',
          weight: m.weight || 0.5,
          successRate: m.successRate || 0.5,
          source: m.source || 'auto',
        };
      } catch { return null; }
    }).filter(l => l !== null && l.lesson.length > 0 && l.source === 'HUMAN_CORRECTION') as any[];

    // Trier par weight × successRate
    parsed.sort((a, b) => (b.weight * b.successRate) - (a.weight * a.successRate));

    return parsed.slice(0, maxLessons);
  } catch (err) {
    console.warn('[HumanFeedback] Failed to fetch correction lessons:', err);
    return [];
  }
}

// ─── Get correction statistics (for dashboard) ──────────────────────────────

export async function getCorrectionStats(
  options: { lookbackDays?: number } = {}
): Promise<{
  totalCorrections: number;
  byAgent: Record<string, number>;
  byType: Record<string, number>;
  lessonsExtracted: number;
  topLessons: Array<{ lesson: string; agent: string; severity: string; successRate: number }>;
}> {
  const { lookbackDays = 30 } = options;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const corrections = await prisma.agentAuditLog.findMany({
      where: {
        action: 'HUMAN_CORRECTION',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
    });

    const allLessons = await prisma.agentAuditLog.findMany({
      where: {
        action: 'LESSON_LEARNED',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
    });

    // Filter lessons by source = HUMAN_CORRECTION
    const lessons = allLessons.filter(l => {
      try {
        const m = JSON.parse(l.metadata || '{}');
        return m.source === 'HUMAN_CORRECTION';
      } catch { return false; }
    });

    const byAgent: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const c of corrections) {
      try {
        const m = JSON.parse(c.metadata || '{}');
        byAgent[c.agent] = (byAgent[c.agent] || 0) + 1;
        const type = m.correctionType || 'other';
        byType[type] = (byType[type] || 0) + 1;
      } catch {}
    }

    const topLessons = lessons.slice(0, 10).map(l => {
      try {
        const m = JSON.parse(l.metadata || '{}');
        return {
          lesson: m.lesson || '',
          agent: l.agent,
          severity: m.severity || 'medium',
          successRate: m.successRate || 0,
        };
      } catch {
        return { lesson: '', agent: l.agent, severity: 'medium', successRate: 0 };
      }
    });

    return {
      totalCorrections: corrections.length,
      byAgent,
      byType,
      lessonsExtracted: lessons.length,
      topLessons,
    };
  } catch (err) {
    console.warn('[HumanFeedback] Failed to get stats:', err);
    return { totalCorrections: 0, byAgent: {}, byType: {}, lessonsExtracted: 0, topLessons: [] };
  }
}
