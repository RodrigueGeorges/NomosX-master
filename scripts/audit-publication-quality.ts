import "./load-env.mjs";
import { PrismaClient } from "@prisma/client";
import { evaluatePublicationReadiness, getPublicationQualityRule } from "../lib/publication-visibility";

const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const shouldHold = args.has("--hold");
const asJson = args.has("--json");

async function main() {
  const publications = await prisma.thinkTankPublication.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      publicId: true,
      title: true,
      type: true,
      status: true,
      trustScore: true,
      qualityScore: true,
      citationCoverage: true,
      wordCount: true,
      sourceIds: true,
      publishedAt: true,
    },
  });

  const audit = publications.map((publication) => {
    const readiness = evaluatePublicationReadiness(publication);
    return {
      id: publication.id,
      publicId: publication.publicId,
      title: publication.title,
      type: publication.type,
      status: publication.status,
      publishedAt: publication.publishedAt,
      trustScore: publication.trustScore,
      qualityScore: publication.qualityScore,
      citationCoverage: publication.citationCoverage,
      wordCount: publication.wordCount,
      sourceCount: publication.sourceIds.length,
      rule: getPublicationQualityRule(publication.type),
      ok: readiness.ok,
      failures: readiness.failures,
    };
  });

  const failing = audit.filter((publication) => !publication.ok);

  if (shouldHold && failing.length > 0) {
    await prisma.thinkTankPublication.updateMany({
      where: { id: { in: failing.map((publication) => publication.id) } },
      data: { status: "HELD", publishedAt: null },
    });
  }

  if (asJson) {
    console.log(JSON.stringify({ checked: audit.length, failing: failing.length, held: shouldHold ? failing.length : 0, publications: audit }, null, 2));
    return;
  }

  console.log(`\nNomosX publication quality audit`);
  console.log(`Checked: ${audit.length}`);
  console.log(`Failing: ${failing.length}`);
  console.log(`Held: ${shouldHold ? failing.length : 0}`);

  if (failing.length === 0) {
    console.log("\nAll published publications pass the current business rules.");
    return;
  }

  console.log("\nFailing publications:");
  for (const publication of failing) {
    console.log(`\n- ${publication.id} | ${publication.type} | ${publication.title}`);
    console.log(`  trust=${publication.trustScore} quality=${publication.qualityScore} citation=${Math.round(publication.citationCoverage * 100)}% words=${publication.wordCount} sources=${publication.sourceCount}`);
    for (const failure of publication.failures) {
      console.log(`  - ${failure}`);
    }
  }

  if (!shouldHold) {
    console.log("\nRun again with --hold to set failing publications to HELD and clear publishedAt.");
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
