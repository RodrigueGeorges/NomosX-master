/**
 * SELF-CORRECT CHECKPOINT: QUALITY LOOP (final trust score).
 * Extracted from pipeline-v2.ts — identical semantics, unit-testable boundary.
 */

import { citationCoverageVerifier } from '../self-correct';
import type { TailStepContext } from './types';

export async function runFinalSelfCorrectCheckpoint(ctx: TailStepContext): Promise<void> {
  const { stats, topSources, orchState, label, selfCorrector } = ctx;
  try {
    const finalTrust = orchState.trustScore ?? 0;
    const cpResult = await selfCorrector.checkpoint(
      'quality_loop',
      ctx.html.slice(0, 8000),
      [
        citationCoverageVerifier('final_citation_coverage', topSources.length, 0.35),
        {
          id: 'trust_threshold',
          check: () => {
            if (finalTrust < 55) {
              return { verifierId: 'trust_threshold', verdict: 'escalate' as const, score: finalTrust / 100, reasons: [`Trust score ${finalTrust}/100 below minimum viable (55) — report should not publish`] };
            }
            if (finalTrust < 65) {
              return { verifierId: 'trust_threshold', verdict: 'retry' as const, score: finalTrust / 100, reasons: [`Trust score ${finalTrust}/100 below publication threshold (65) — quality loop may need another pass`] };
            }
            return { verifierId: 'trust_threshold', verdict: 'pass' as const, score: finalTrust / 100, reasons: [] };
          },
        },
      ],
      finalTrust / 100,
    );
    const scStats = selfCorrector.getStats();
    (stats as any).selfCorrect = {
      ...((stats as any).selfCorrect ?? {}),
      finalCheckpoint: cpResult,
      stats: scStats,
    };
    if (cpResult.cascadeDetected) {
      console.warn(`${label} SELF-CORRECT: CASCADE detected at QUALITY LOOP — rollback target: ${cpResult.rollbackTarget ?? 'none'}`);
      ctx.selfCorrectRollbacks++;
    }
    console.log(`${label} SELF-CORRECT SUMMARY: ${scStats.stagesChecked} stages, ${scStats.totalRetries} retries, ${scStats.cascadesDetected} cascades, avg drift=${scStats.avgDrift.toFixed(3)}, ${scStats.cleanStages}/${scStats.stagesChecked} clean`);
  } catch (scErr) {
    console.warn(`${label} SELF-CORRECT: QUALITY LOOP checkpoint failed (non-blocking):`, scErr);
  }
}
