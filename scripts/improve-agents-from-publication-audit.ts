import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  autoDetectFailureModes,
  recordAgentPerformance,
  storeLesson,
  type FailureMode,
} from "../lib/agent/agent-memory";
import { evaluatePublicationReadiness } from "../lib/publication-visibility";

config({ path: ".env.local" });
config({ path: ".env.production" });
config();

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply");
const asJson = args.has("--json");
const lookbackDays = Number(process.argv.find((arg) => arg.startsWith("--days="))?.split("=")[1] || 30);

type PublicationForAudit = Awaited<ReturnType<typeof loadCandidatePublications>>[number];

async function loadCandidatePublications() {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  return prisma.thinkTankPublication.findMany({
    where: {
      OR: [
        { status: "PUBLISHED" },
        { status: "HELD" },
        { status: "DRAFT" },
        { updatedAt: { gte: cutoff } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      publicId: true,
      title: true,
      type: true,
      status: true,
      html: true,
      trustScore: true,
      qualityScore: true,
      citationCoverage: true,
      wordCount: true,
      sourceIds: true,
      claimCount: true,
      citedClaimCount: true,
      criticalLoopResult: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
}

function countFindings(html: string) {
  const matches = html.match(/<li\b|Key Finding|Finding|Recommendation|Scenario/gi);
  return matches?.length || 0;
}

function detectAdditionalFailureModes(publication: PublicationForAudit, readinessFailures: string[]): FailureMode[] {
  const modes = autoDetectFailureModes({
    confidenceGiven: publication.trustScore || 0,
    trustScore: publication.trustScore || 0,
    citationCoverage: publication.citationCoverage || 0,
    contradictionsFound: 0,
    sourceDiversity: Math.min(publication.sourceIds.length, 3),
    findingsCount: countFindings(publication.html || ""),
  });

  if (readinessFailures.some((failure) => failure.includes("wordCount") || failure.includes("sourceCount"))) {
    modes.push("shallow_methodology");
  }
  if (readinessFailures.some((failure) => failure.includes("citationCoverage"))) {
    modes.push("citation_gaps");
  }
  if ((publication.qualityScore || 0) < 75 && !modes.includes("shallow_methodology")) {
    modes.push("shallow_methodology");
  }

  return [...new Set(modes)];
}

function buildLessons(publication: PublicationForAudit, failures: string[], modes: FailureMode[]) {
  const lessons = new Set<string>();
  const label = `${publication.type} "${publication.title}"`;

  if (failures.some((failure) => failure.includes("sourceCount"))) {
    lessons.add(`Do not publish ${publication.type} unless source depth meets the format rule; ${label} failed source depth.`);
  }
  if (failures.some((failure) => failure.includes("wordCount"))) {
    lessons.add(`Expand analysis before publication: ${publication.type} must reach its minimum word count with real argumentation, not filler.`);
  }
  if (failures.some((failure) => failure.includes("citationCoverage"))) {
    lessons.add(`Every factual claim needs visible [SRC-N] support; citation coverage failures must block publication.`);
  }
  if (failures.some((failure) => failure.includes("trustScore") || failure.includes("qualityScore"))) {
    lessons.add(`Low trust or quality scores must result in HELD, not PUBLISHED; revise evidence, methods, and dissent before retrying.`);
  }
  if (modes.includes("provider_bias")) {
    lessons.add(`Avoid provider bias by using cross-provider corroboration before synthesis.`);
  }
  if (modes.includes("overconfident")) {
    lessons.add(`Reduce confidence language when the evidence gate fails; label hypotheses and uncertainty explicitly.`);
  }

  if (lessons.size === 0) {
    lessons.add(`Treat held publication ${label} as a failed run; inspect evidence depth, citations, and methodological critique before retrying.`);
  }

  return [...lessons].slice(0, 5);
}

async function main() {
  const publications = await loadCandidatePublications();
  const failing = publications
    .map((publication) => {
      const readiness = evaluatePublicationReadiness(publication);
      const isFailure = !readiness.ok || publication.status !== "PUBLISHED";
      const failureModes = detectAdditionalFailureModes(publication, readiness.failures);
      const lessons = buildLessons(publication, readiness.failures, failureModes);

      return {
        publication,
        readiness,
        isFailure,
        failureModes,
        lessons,
      };
    })
    .filter((item) => item.isFailure);

  if (!dryRun) {
    for (const item of failing) {
      const runId = item.publication.id;
      const agentIds = ["publisher", "analyst", "reader", "citation-guard"];
      const trustScore = item.publication.trustScore || 0;
      const qualityScore = item.publication.qualityScore || 0;

      for (const agentId of agentIds) {
        await recordAgentPerformance({
          agentId,
          runId,
          question: item.publication.title,
          trustScore,
          qualityScore,
          confidenceGiven: trustScore,
          confidenceActual: Math.min(trustScore, qualityScore),
          citationCoverage: item.publication.citationCoverage || 0,
          findingsCount: countFindings(item.publication.html || ""),
          failureModes: item.failureModes,
          lessonsLearned: item.lessons,
        });
      }

      for (const lesson of item.lessons) {
        await storeLesson("publisher", lesson, runId, undefined, 0.85);
        await storeLesson("analyst", lesson, runId, undefined, 0.75);
      }
    }
  }

  const output = {
    mode: dryRun ? "dry-run" : "applied",
    checked: publications.length,
    failing: failing.length,
    recordsWritten: dryRun ? 0 : failing.length * 4,
    lessonsWritten: dryRun ? 0 : failing.reduce((sum, item) => sum + item.lessons.length * 2, 0),
    publications: failing.map((item) => ({
      id: item.publication.id,
      title: item.publication.title,
      type: item.publication.type,
      status: item.publication.status,
      trustScore: item.publication.trustScore,
      qualityScore: item.publication.qualityScore,
      citationCoverage: item.publication.citationCoverage,
      wordCount: item.publication.wordCount,
      sourceCount: item.publication.sourceIds.length,
      failures: item.readiness.failures,
      failureModes: item.failureModes,
      lessons: item.lessons,
    })),
  };

  if (asJson) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`\nNomosX agent improvement audit`);
  console.log(`Mode: ${output.mode}`);
  console.log(`Checked: ${output.checked}`);
  console.log(`Failing/held/draft: ${output.failing}`);
  console.log(`Performance records written: ${output.recordsWritten}`);
  console.log(`Lessons written: ${output.lessonsWritten}`);

  for (const item of output.publications) {
    console.log(`\n- ${item.id} | ${item.type} | ${item.title}`);
    console.log(`  status=${item.status} trust=${item.trustScore} quality=${item.qualityScore} citation=${Math.round((item.citationCoverage || 0) * 100)}% words=${item.wordCount} sources=${item.sourceCount}`);
    for (const failure of item.failures) console.log(`  failure: ${failure}`);
    for (const lesson of item.lessons) console.log(`  lesson: ${lesson}`);
  }

  if (dryRun) {
    console.log("\nRun with --apply to persist performance records and lessons into AgentAuditLog.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
