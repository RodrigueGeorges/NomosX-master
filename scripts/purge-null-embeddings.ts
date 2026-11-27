/**
 * Purge null/zero embeddings persisted before the run-11 fix.
 *
 * embedBatch fills failed batches with 1536-dim zero vectors; knowledge-graph
 * persisted them into ConceptNode.embedding (Float[]) — 279 rows in run-11.
 * Zero vectors poison cosine similarity (0/0 = NaN) and waste storage.
 *
 * Usage: npx tsx scripts/purge-null-embeddings.ts [--dry-run]
 */
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { prisma } = await import('../lib/db');

  // Count candidates: empty arrays OR arrays where every element is 0.
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; n: bigint }>>(
    `SELECT id, array_length(embedding, 1) AS n FROM "ConceptNode"
     WHERE embedding IS NOT NULL
       AND (array_length(embedding, 1) IS NULL
            OR array_length(embedding, 1) = 0
            OR NOT EXISTS (SELECT 1 FROM unnest(embedding) AS e WHERE e <> 0))`
  );
  console.log(`[PURGE] ${rows.length} ConceptNode rows with null/zero embeddings` + (dryRun ? ' (dry-run)' : ''));

  if (!dryRun && rows.length > 0) {
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "ConceptNode" SET embedding = '{}'
       WHERE embedding IS NOT NULL
         AND (array_length(embedding, 1) IS NULL
              OR array_length(embedding, 1) = 0
              OR NOT EXISTS (SELECT 1 FROM unnest(embedding) AS e WHERE e <> 0))`
    );
    console.log(`[PURGE] reset ${updated} rows to empty embedding`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
