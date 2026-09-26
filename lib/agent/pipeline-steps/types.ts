/**
 * Shared context for post-render tail steps extracted from pipeline-v2.ts.
 *
 * Extraction contract: the orchestrator builds ONE context object after the
 * HTML render, each step mutates it in place (ctx.html = ..., ctx.stats.* =
 * ...), and the orchestrator reads back `ctx.html` / `ctx.selfCorrectRollbacks`
 * afterwards. This keeps the closure-coupled blocks testable as units without
 * changing their semantics.
 */

import type { SelfCorrector } from '../self-correct';

export interface TailStepContext {
  /** Current rendered HTML — steps may rewrite it (assign ctx.html). */
  html: string;
  /** The analysis object produced by the analyst step. */
  analysis: Record<string, any>;
  topSources: any[];
  readings: any[];
  /** Pipeline stats bag — every step writes its own key. */
  stats: Record<string, any>;
  /** Orchestrator state (trustScore is mutated by the quality loop). */
  orchState: { trustScore?: number | null } & Record<string, any>;
  evidenceRegistry: any;
  /** Log prefix, e.g. "[PIPELINE]" — kept identical to the legacy blocks. */
  label: string;
  query: string;
  topicClassification?: { primaryDomain?: string; dimensions?: { label: string }[] } | null;
  detectedDomain?: string;
  isStrategic: boolean;
  isMemo: boolean;
  isDossier: boolean;
  selfCorrector: SelfCorrector;
  /** Sprint 28 artifact versioning — call after any material HTML rewrite
   *  so verdicts attached to the previous HTML are marked stale. */
  bumpHtmlArtifact: () => void;
  tagEval: <T extends Record<string, any>>(entry: T, artifact: 'analysis' | 'html') => T;
  collectStaleEvaluations: () => string[];
  /** Incremented by the self-correct step when a cascade fires. */
  selfCorrectRollbacks: number;
}
