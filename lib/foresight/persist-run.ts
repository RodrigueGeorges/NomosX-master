/**
 * Persist ForesightRun telemetry row (Prisma) — non-blocking on schema drift
 */

import { prisma } from "@/lib/db";
import type { ForesightBundle } from "./types";

export interface PersistForesightRunInput {
  publicationId: string;
  briefId?: string;
  lineage?: Record<string, unknown>;
  bundle?: ForesightBundle | null;
}

function telemetryFromInput(input: PersistForesightRunInput) {
  const run = (input.lineage?.foresightRun ?? {}) as Record<string, unknown>;
  const tel = input.bundle?.telemetry;
  return {
    swarmSize: Number(run.swarmSize ?? tel?.swarmSize ?? 0),
    voicePersonas: Number(tel?.voicePersonas ?? 0),
    seedRuns: Number(run.seedRuns ?? tel?.seedRuns ?? 1),
    monteCarloRuns: Number(tel?.monteCarloRuns ?? 0),
    converged: Boolean(run.converged ?? tel?.monteCarloConverged ?? false),
    tickCount: Number(tel?.tickCount ?? 0),
    llmTickCount: Number(run.llmTicks ?? tel?.llmTickCount ?? 0),
    socialPostCount: Number(tel?.socialPostCount ?? 0),
    graphNodes: Number(tel?.graphNodes ?? 0),
    graphEdges: Number(tel?.graphEdges ?? 0),
    costUsd: Number(run.costUsd ?? tel?.totalCostUsd ?? 0),
    durationMs: Number(run.durationMs ?? 0),
    telemetry: tel ? (tel as object) : run.at ? { at: run.at } : undefined,
  };
}

export async function persistForesightRun(input: PersistForesightRunInput): Promise<void> {
  const bundle = input.bundle;
  if (!bundle?.available && !input.lineage?.simulation && !input.lineage?.foresightRun) {
    return;
  }

  const fields = telemetryFromInput(input);

  try {
    await prisma.foresightRun.upsert({
      where: { publicationId: input.publicationId },
      create: {
        publicationId: input.publicationId,
        briefId: input.briefId,
        ...fields,
      },
      update: {
        briefId: input.briefId,
        ...fields,
      },
    });
  } catch (err) {
    console.warn(
      `[ForesightRun] persist skipped for pub=${input.publicationId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
