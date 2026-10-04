/**
 * Self-Correction Integration Layer — NomosX
 *
 * Câble la self-correction (Reflexion/MASC pattern) dans le pipeline de production.
 * Ce module est le pont entre self-correction.ts (qui existe mais n'était jamais appelé)
 * et pipeline-v2.ts.
 *
 * Trois points d'intégration :
 * 1. afterReader()  — évalue la qualité du READER, retry si < 50
 * 2. afterAnalyst() — évalue la qualité de l'ANALYST, retry si < 50
 * 3. reAnalyzeAfterGapFill() — re-exécute l'ANALYST avec les nouvelles sources gap-filled
 *
 * Pattern : Reflexion (NeurIPS 2023) + MASC (ACL 2026)
 * - Assess quality → if low, generate feedback → retry with feedback
 * - Max 2 retries per phase
 * - All reflections stored for cross-run learning (via recordFailure)
 */

import { reflectAndRetry, assessPhaseQuality, buildCorrectionFeedback } from './self-correction';
import type { SelfCorrectionResult, PhaseReflection } from './self-correction';
import type { PipelinePhase } from './cross-model-consensus';
import { assertExecutionActive } from '../worker/execution-scope';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReaderSelfCorrectionInput {
  query: string;
  readings: Array<{ sourceId: string; claims: string[]; confidence: string }>;
  retryFn: (feedback: string) => Promise<Array<{ sourceId: string; claims: string[]; confidence: string }>>;
  maxRetries?: number;
}

export interface AnalystSelfCorrectionInput {
  query: string;
  analysis: any; // MultiPassAnalysis
  sourceCount: number;
  citationCount: number;
  retryFn: (feedback: string) => Promise<any>;
  maxRetries?: number;
}

export interface SelfCorrectionStats {
  phase: PipelinePhase;
  triggered: boolean;
  originalScore: number;
  finalScore: number;
  retries: number;
  improved: boolean;
  issues: string[];
  recommendations: string[];
  costUsd: number;
}

// ─── After READER : self-correction sur l'extraction ────────────────────────

/**
 * Évalue la qualité du READER et retry si nécessaire.
 * Critères : claims extraits, distribution de confiance, spécificité.
 */
export async function selfCorrectReader(
  input: ReaderSelfCorrectionInput
): Promise<{ readings: typeof input.readings; stats: SelfCorrectionStats }> {
  const { query, readings, retryFn, maxRetries = 1 } = input;

  // Évaluation initiale
  const reflection = await assessPhaseQuality({
    phase: 'reader',
    query,
    output: JSON.stringify(readings).slice(0, 2000),
    readings: readings.map(r => ({
      sourceId: r.sourceId,
      claims: r.claims,
      confidence: r.confidence,
    })),
  });

  // Si qualité suffisante, pas de retry.
  // Threshold lowered from 50 to 40 — the READER often scores 45-55 due to
  // abstract-only sources (no full text), which is acceptable. Retrying at 48
  // wastes ~3 minutes and $0.01 for no improvement (observed: 48 → 47).
  // Also skip retry if within 5 points of the threshold — the improvement
  // potential is too small to justify the cost.
  const READER_RETRY_THRESHOLD = 40;
  if (!reflection.shouldRetry || reflection.score >= READER_RETRY_THRESHOLD ||
      reflection.score >= READER_RETRY_THRESHOLD - 5) {
    return {
      readings,
      stats: {
        phase: 'reader',
        triggered: false,
        originalScore: reflection.score,
        finalScore: reflection.score,
        retries: 0,
        improved: false,
        issues: reflection.issues,
        recommendations: reflection.recommendations,
        costUsd: reflection.costUsd,
      },
    };
  }

  console.log(`[SelfCorrection] READER quality ${reflection.score}/100 — triggering retry (issues: ${reflection.issues.length})`);

  // Retry avec feedback
  const feedback = buildCorrectionFeedback(reflection);
  let currentReadings = readings;
  let bestReaderScore = reflection.score;  // Version buffer: track best across retries
  let retries = 0;
  let totalCost = reflection.costUsd;
  const reflections: PhaseReflection[] = [reflection];

  while (reflection.shouldRetry && retries < maxRetries) {
    retries++;
    try {
      const retriedReadings = await retryFn(feedback);
      // Ne garder le retry que s'il est meilleur
      const retriedReflection = await assessPhaseQuality({
        phase: 'reader',
        query,
        output: JSON.stringify(retriedReadings).slice(0, 2000),
        readings: retriedReadings.map(r => ({
          sourceId: r.sourceId,
          claims: r.claims,
          confidence: r.confidence,
        })),
      });
      reflections.push(retriedReflection);
      totalCost += retriedReflection.costUsd;

      // Version buffer (CyberCorrect): keep the best version across all retries
      if (retriedReflection.score > bestReaderScore) {
        bestReaderScore = retriedReflection.score;
        currentReadings = retriedReadings;
        console.log(`[SelfCorrection] READER retry ${retries}: ${reflection.score} → ${retriedReflection.score} (new best)`);
      } else {
        console.log(`[SelfCorrection] READER retry ${retries}: ${retriedReflection.score} ≤ best ${bestReaderScore} — keeping best (overshoot rollback)`);
      }

      // EIR/ECR: stop if retries are counterproductive
      if (retries >= 2 && retriedReflection.score < reflection.score) {
        console.log(`[SelfCorrection] READER EIR/ECR: retry degraded score — stopping`);
        break;
      }

      if (bestReaderScore >= 50) break;
    } catch (err) {
      console.warn(`[SelfCorrection] READER retry ${retries} failed:`, err);
      break;
    }
  }

  const originalScore = reflections[0]?.score || 0;
  const finalScore = bestReaderScore;

  return {
    readings: currentReadings,
    stats: {
      phase: 'reader',
      triggered: true,
      originalScore,
      finalScore,
      retries,
      improved: finalScore > originalScore,
      issues: reflections.flatMap(r => r.issues),
      recommendations: reflections.flatMap(r => r.recommendations),
      costUsd: totalCost,
    },
  };
}

// ─── After ANALYST : self-correction sur l'analyse ──────────────────────────

/**
 * Évalue la qualité de l'ANALYST et retry si nécessaire.
 * Critères : citations, adressage de la question, non-trivialité, debate.
 */
export async function selfCorrectAnalyst(
  input: AnalystSelfCorrectionInput
): Promise<{ analysis: any; stats: SelfCorrectionStats }> {
  const { query, analysis, sourceCount, citationCount, retryFn, maxRetries = 1 } = input;

  const analysisStr = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);

  const reflection = await assessPhaseQuality({
    phase: 'analyst',
    query,
    output: analysisStr,
    sourceCount,
    citationCount,
  });

  if (!reflection.shouldRetry || reflection.score >= 50) {
    return {
      analysis,
      stats: {
        phase: 'analyst',
        triggered: false,
        originalScore: reflection.score,
        finalScore: reflection.score,
        retries: 0,
        improved: false,
        issues: reflection.issues,
        recommendations: reflection.recommendations,
        costUsd: reflection.costUsd,
      },
    };
  }

  console.log(`[SelfCorrection] ANALYST quality ${reflection.score}/100 — triggering retry (issues: ${reflection.issues.length})`);

  const feedback = buildCorrectionFeedback(reflection);
  let currentAnalysis = analysis;
  let bestAnalystScore = reflection.score;  // Version buffer: track best across retries
  let retries = 0;
  let totalCost = reflection.costUsd;
  const reflections: PhaseReflection[] = [reflection];

  while (reflection.shouldRetry && retries < maxRetries) {
    retries++;
    try {
      const retriedAnalysis = await retryFn(feedback);
      const retriedStr = typeof retriedAnalysis === 'string' ? retriedAnalysis : JSON.stringify(retriedAnalysis);
      const retriedCitations = (retriedStr.match(/\[SRC-\d+\]/g) || []).length;

      const retriedReflection = await assessPhaseQuality({
        phase: 'analyst',
        query,
        output: retriedStr,
        sourceCount,
        citationCount: retriedCitations,
      });
      reflections.push(retriedReflection);
      totalCost += retriedReflection.costUsd;

      // Version buffer (CyberCorrect): keep the best version across all retries
      if (retriedReflection.score > bestAnalystScore) {
        bestAnalystScore = retriedReflection.score;
        currentAnalysis = retriedAnalysis;
        console.log(`[SelfCorrection] ANALYST retry ${retries}: ${reflection.score} → ${retriedReflection.score} (new best)`);
      } else {
        console.log(`[SelfCorrection] ANALYST retry ${retries}: ${retriedReflection.score} ≤ best ${bestAnalystScore} — keeping best (overshoot rollback)`);
      }

      // EIR/ECR: stop if retries are counterproductive
      if (retries >= 2 && retriedReflection.score < reflection.score) {
        console.log(`[SelfCorrection] ANALYST EIR/ECR: retry degraded score — stopping`);
        break;
      }

      if (bestAnalystScore >= 50) break;
    } catch (err) {
      console.warn(`[SelfCorrection] ANALYST retry ${retries} failed:`, err);
      break;
    }
  }

  const originalScore = reflections[0]?.score || 0;
  const finalScore = bestAnalystScore;

  return {
    analysis: currentAnalysis,
    stats: {
      phase: 'analyst',
      triggered: true,
      originalScore,
      finalScore,
      retries,
      improved: finalScore > originalScore,
      issues: reflections.flatMap(r => r.issues),
      recommendations: reflections.flatMap(r => r.recommendations),
      costUsd: totalCost,
    },
  };
}

// ─── Re-exécution ANALYST après gap-fill ────────────────────────────────────

/**
 * Le bug critique : après gap-fill (ANALYST identifie un gap → SCOUT le remplit),
 * l'ANALYST n'était JAMAIS re-exécuté avec les nouvelles sources.
 * Seul le rendu HTML en bénéficiait.
 *
 * Cette fonction re-exécute l'ANALYST avec les sources enrichies et garde
 * la meilleure version (comparaison par citation coverage + longueur).
 */
export async function reAnalyzeAfterGapFill(
  query: string,
  originalAnalysis: any,
  enrichedSources: any[],
  readings: any[],
  analystFn: (query: string, sources: any[], readings: any[], options: any) => Promise<any>,
  options: { contextBlock?: string; domain?: string; depth?: 'brief' | 'strategic' }
): Promise<{ analysis: any; reAnalyzed: boolean; improvementDelta: number; costUsd?: number }> {
  assertExecutionActive();
  const originalStr = typeof originalAnalysis === 'string' ? originalAnalysis : JSON.stringify(originalAnalysis);
  const originalCitations = new Set((originalStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
  const originalLength = originalStr.length;

  console.log(`[GapFillReAnalysis] Re-running ANALYST with ${enrichedSources.length} sources (was ${originalCitations} citations)`);

  try {
    const reAnalysis = await analystFn(query, enrichedSources, readings, {
      ...options,
      contextBlock: (options.contextBlock || '') + '\n\n## GAP-FILL UPDATE\nNew sources were added to fill evidence gaps. Integrate them with [SRC-N] citations where relevant.',
    });

    assertExecutionActive();
    const costUsd = Number.isFinite(reAnalysis?._meta?.totalCostUsd) ? Math.max(0, reAnalysis._meta.totalCostUsd) : 0;
    if (reAnalysis?._meta?.failed) return { analysis: originalAnalysis, reAnalyzed: false, improvementDelta: 0, costUsd };
    const reStr = typeof reAnalysis === 'string' ? reAnalysis : JSON.stringify(reAnalysis);
    const reCitations = new Set((reStr.match(/\[SRC-\d+\]/g) || []).map((m: string) => m)).size;
    const reLength = reStr.length;

    // Comparaison : on garde le retry seulement s'il a plus de citations ET une longueur comparable
    const citationDelta = reCitations - originalCitations;
    const lengthRatio = reLength / Math.max(originalLength, 1);

    if (reCitations > originalCitations && lengthRatio > 0.7) {
      console.log(`[GapFillReAnalysis] Improved: ${originalCitations} → ${reCitations} citations (+${citationDelta}), length ratio ${lengthRatio.toFixed(2)}`);
      return {
        analysis: reAnalysis,
        reAnalyzed: true,
        improvementDelta: citationDelta,
        costUsd,
      };
    } else {
      console.log(`[GapFillReAnalysis] No improvement: ${originalCitations} → ${reCitations} citations, length ratio ${lengthRatio.toFixed(2)} — keeping original`);
      return {
        analysis: originalAnalysis,
        reAnalyzed: false,
        improvementDelta: 0,
        costUsd,
      };
    }
  } catch (err) {
    assertExecutionActive();
    console.warn(`[GapFillReAnalysis] Failed, keeping original:`, err);
    return {
      analysis: originalAnalysis,
      reAnalyzed: false,
      improvementDelta: 0,
    };
  }
}
