/**
 * NomosX Pipeline Progress Streaming
 * 
 * P2-9: EventEmitter-based progress tracking for pipeline execution.
 * Enables SSE streaming of step-by-step updates to the client.
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export type PipelineStep =
  | "INIT"
  | "SCOUT"
  | "DEDUP"
  | "INDEX"
  | "RANK"
  | "READER"
  | "TOPIC_VALIDATION"
  | "ORCHESTRATOR"
  | "CONTEXT_PRIMER"
  | "ANALYST"
  | "CITATION_GUARD"
  | "EDITOR"
  | "HARVARD_COUNCIL"
  | "DELIBERATION"
  | "CITATION_VERIFIER"
  | "CRITICAL_LOOP"
  | "DEBATE"
  | "META_ANALYSIS"
  | "DEVILS_ADVOCATE"
  | "PUBLISHER"
  | "KNOWLEDGE_GRAPH"
  | "COMPLETE"
  | "ERROR";

export interface PipelineProgressEvent {
  runId: string;
  step: PipelineStep;
  status: "started" | "completed" | "failed" | "skipped";
  message: string;
  progress: number; // 0-100
  timestamp: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// STEP WEIGHTS (approximate % of total pipeline time)
// ============================================================================

const STEP_PROGRESS: Record<PipelineStep, number> = {
  INIT: 2,
  SCOUT: 15,
  DEDUP: 17,
  INDEX: 22,
  RANK: 25,
  READER: 35,
  TOPIC_VALIDATION: 37,
  ORCHESTRATOR: 39,
  CONTEXT_PRIMER: 41,
  ANALYST: 55,
  CITATION_GUARD: 57,
  EDITOR: 62,
  HARVARD_COUNCIL: 75,
  DELIBERATION: 80,
  CITATION_VERIFIER: 83,
  CRITICAL_LOOP: 86,
  DEBATE: 90,
  META_ANALYSIS: 92,
  DEVILS_ADVOCATE: 96,
  PUBLISHER: 98,
  KNOWLEDGE_GRAPH: 99,
  COMPLETE: 100,
  ERROR: -1,
};

// ============================================================================
// GLOBAL EMITTER (per-process, keyed by runId)
// ============================================================================

const globalEmitter = new EventEmitter();
globalEmitter.setMaxListeners(50);

/**
 * Emit a pipeline progress event.
 * Called from within runPipelineCore at each step.
 */
export function emitProgress(
  runId: string,
  step: PipelineStep,
  status: "started" | "completed" | "failed" | "skipped",
  message: string,
  metadata?: Record<string, any>
): void {
  const event: PipelineProgressEvent = {
    runId,
    step,
    status,
    message,
    progress: status === "failed" ? STEP_PROGRESS[step] : STEP_PROGRESS[step],
    timestamp: Date.now(),
    metadata,
  };

  globalEmitter.emit(`progress:${runId}`, event);
}

/**
 * Subscribe to progress events for a specific pipeline run.
 * Returns an unsubscribe function.
 */
export function onProgress(
  runId: string,
  callback: (event: PipelineProgressEvent) => void
): () => void {
  const listener = (event: PipelineProgressEvent) => callback(event);
  globalEmitter.on(`progress:${runId}`, listener);
  return () => globalEmitter.off(`progress:${runId}`, listener);
}

/**
 * Create a ReadableStream of SSE events for a pipeline run.
 * Used by the SSE API route.
 */
export function createProgressStream(runId: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const unsubscribe = onProgress(runId, (event) => {
        const sseData = `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(sseData));
        } catch {
          // Stream closed by client
          unsubscribe();
        }

        if (event.step === "COMPLETE" || event.step === "ERROR") {
          try {
            controller.close();
          } catch {
            // Already closed
          }
          unsubscribe();
        }
      });

      // Send initial heartbeat
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", runId })}\n\n`));
    },
  });
}
