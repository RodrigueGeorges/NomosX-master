/**
 * NomosX Auto-Publisher V2 — Autonomous think tank entry (deprecated path)
 * ───────────────────────────────────────────────────────────────────────────
 * Production crons use ThinkTankDispatcher directly.
 * This wrapper exists for scripts / manual invocation only.
 */

import { runThinkTankCycle, type ThinkTankCycleResult } from "./think-tank-dispatcher";
import { AgentRole, assertPermission } from "@/lib/governance";
import type { InquiryDepth } from "./inquiry-pipeline";

export interface PublisherConfig {
  maxPublications?: number;
  minTrustScore?: number;
  dryRun?: boolean;
  /** @deprecated Use ThinkTankCycleMode instead */
  defaultDepth?: InquiryDepth;
}

export interface PublicationResult {
  topic: string;
  strategy: "editorial" | "signal" | "proactive";
  inquiryId: string;
  slug: string;
  trustScore: number;
  wordCount: number;
  costUsd: number;
  durationMs: number;
  providers: string[];
  status: "published" | "review" | "failed";
  error?: string;
}

export interface PublisherOutput {
  published: number;
  pendingReview: number;
  failed: number;
  results: PublicationResult[];
  totalCostUsd: number;
  totalDurationMs: number;
  runId: string;
}

function mapCycleToOutput(cycle: ThinkTankCycleResult, runId: string): PublisherOutput {
  const results: PublicationResult[] = cycle.outcomes.map((o) => ({
    topic: o.item.question,
    strategy: o.item.strategy === "signal" ? "signal" : "editorial",
    inquiryId: o.result.inquiry?.id ?? o.result.briefId ?? "",
    slug: o.result.inquiry?.slug ?? o.result.publicId ?? "",
    trustScore: o.result.trustScore,
    wordCount: o.result.wordCount,
    costUsd: o.result.costUsd,
    durationMs: o.result.durationMs,
    providers: o.item.providers ?? [],
    status:
      o.result.status === "published"
        ? "published"
        : o.result.status === "failed"
          ? "failed"
          : "review",
    error: o.result.error,
  }));

  return {
    published: cycle.published,
    pendingReview: cycle.held + cycle.skipped,
    failed: cycle.failed,
    results,
    totalCostUsd: cycle.totalCostUsd,
    totalDurationMs: cycle.durationMs,
    runId,
  };
}

/**
 * Manual / script entry — delegates to weekly think-tank cycle.
 * Crons should call ThinkTankDispatcher or HTTP cron routes directly.
 */
export async function runAutoPublisherV2(config: PublisherConfig = {}): Promise<PublisherOutput> {
  const runId = `apv2-${Date.now()}`;

  console.log(`[AutoPublisherV2] Delegating to ThinkTankDispatcher (weekly) run=${runId}`);
  assertPermission(AgentRole.PUBLISHER, "publish:publication");

  const cycle = await runThinkTankCycle({
    mode: "weekly",
    maxPublications: config.maxPublications,
    dryRun: config.dryRun,
  });

  return mapCycleToOutput(cycle, runId);
}
