/**
 * Backfill foresight metadata on existing ThinkTank publications.
 *
 * Usage:
 *   npx tsx scripts/backfill-foresight-metadata.ts [--dry-run] [--limit=N]
 *
 * Does NOT re-run simulation by default (no LLM cost). Reconstructs foresight bundle
 * from brief.lineage or criticalLoopResult.simulation and injects HTML section if missing.
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  buildForesightPersistPayload,
  extractForesightFromLineage,
  appendSimulationToHtml,
  htmlHasForesightSection,
  renderSimulationHtmlSection,
  persistForesightRun,
} from "../lib/foresight";
import type { SimulationReport } from "../lib/agent/simulation-agent";
import type { Inquiry, InquiryDepth } from "../lib/types/inquiry";

config({ path: ".env.local" });
config({ path: ".env.production" });
config();

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) : undefined;

function minimalInquiry(
  pub: { id: string; title: string; publicId: string | null; publishedAt: Date | null; createdAt: Date; updatedAt: Date },
  meta: Record<string, unknown>,
  briefId?: string
): Inquiry {
  return {
    id: briefId ?? pub.id,
    slug: pub.publicId ?? pub.id,
    title: pub.title,
    question: String(meta.question ?? pub.title),
    domain: String(meta.domain ?? "general"),
    depth: (meta.depth as InquiryDepth) ?? "deep",
    status: "published",
    verdict: { value: "—", label: "Backfill" },
    sections: [],
    sources: [],
    readTime: 10,
    publishedAt: pub.publishedAt ?? pub.createdAt,
    updatedAt: pub.updatedAt,
  };
}

function lineageFromSources(
  meta: Record<string, unknown>,
  briefLineage: Record<string, unknown> | null
): Record<string, unknown> {
  if (briefLineage?.simulation) return briefLineage;
  if (meta.simulation) {
    return {
      simulation: meta.simulation,
      simulationSummary: meta.simulationSummary,
      simulationContextBlock: meta.simulationContextBlock,
      foresightRun: meta.foresightRun,
    };
  }
  return briefLineage ?? {};
}

async function main() {
  const publications = await prisma.thinkTankPublication.findMany({
    where: { status: { in: ["PUBLISHED", "HELD"] } },
    orderBy: { createdAt: "desc" },
    take: limit && Number.isFinite(limit) ? limit : undefined,
    select: {
      id: true,
      title: true,
      publicId: true,
      html: true,
      wordCount: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      criticalLoopResult: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  let htmlPatched = 0;

  for (const pub of publications) {
    const meta = (pub.criticalLoopResult ?? {}) as Record<string, unknown>;
    const briefId = meta.briefId ? String(meta.briefId) : undefined;

    let briefLineage: Record<string, unknown> | null = null;
    if (briefId) {
      const brief = await prisma.brief.findUnique({
        where: { id: briefId },
        select: { lineage: true, html: true },
      });
      briefLineage = (brief?.lineage ?? null) as Record<string, unknown> | null;
    }

    const lineage = lineageFromSources(meta, briefLineage);
    const bundle = extractForesightFromLineage(lineage);
    const hasSim = Boolean(lineage.simulation);
    const hasForesightMeta = Boolean(
      (meta.foresight as { available?: boolean } | undefined)?.available ?? meta.simulation
    );

    if (!hasSim && !hasForesightMeta) {
      skipped++;
      continue;
    }

    const inquiry = minimalInquiry(pub, meta, briefId);
    const payload = buildForesightPersistPayload(lineage, inquiry);
    const nextMeta = {
      ...meta,
      ...payload,
      foresight: payload.foresight ?? meta.foresight,
    };

    let html = pub.html;
    if (hasSim && !htmlHasForesightSection(html)) {
      const report: SimulationReport = {
        summary: String(lineage.simulationSummary ?? ""),
        output: lineage.simulation as SimulationReport["output"],
        contextBlock: String(lineage.simulationContextBlock ?? ""),
      };
      if (report.output?.scenarios?.length) {
        const section = renderSimulationHtmlSection(report);
        html = appendSimulationToHtml(html, section);
        htmlPatched++;
      }
    }

    const wordCount =
      html !== pub.html ? Math.max(1, Math.round(html.replace(/<[^>]+>/g, " ").split(/\s+/).length)) : pub.wordCount;

    console.log(
      `[backfill] ${dryRun ? "DRY " : ""}${pub.publicId ?? pub.id} foresight=${Boolean(payload.foresight)} html=${html !== pub.html}`
    );

    if (!dryRun) {
      await prisma.thinkTankPublication.update({
        where: { id: pub.id },
        data: {
          html,
          wordCount,
          criticalLoopResult: nextMeta,
        },
      });

      if (briefId && briefLineage) {
        await prisma.brief.update({
          where: { id: briefId },
          data: {
            lineage: { ...briefLineage, ...payload },
            ...(html !== pub.html ? {} : {}),
          },
        });
      }

      await persistForesightRun({
        publicationId: pub.id,
        briefId,
        lineage,
        bundle: (payload.foresight as typeof bundle) ?? bundle,
      });
    }

    updated++;
  }

  console.log(
    `\nDone: ${updated} updated, ${skipped} skipped (no simulation), ${htmlPatched} HTML sections ${dryRun ? "(dry-run)" : "patched"}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
