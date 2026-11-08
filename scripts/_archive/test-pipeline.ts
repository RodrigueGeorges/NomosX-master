/**
 * Pipeline Test — runs the full NomosX publication pipeline end-to-end.
 * Run: node --import tsx scripts/test-pipeline.ts
 *
 * Usage:
 *   node --import tsx scripts/test-pipeline.ts                              # brief mode, default query
 *   node --import tsx scripts/test-pipeline.ts "your query here"             # brief mode, custom query
 *   node --import tsx scripts/test-pipeline.ts "your query" strategic        # strategic mode
 */

// Load .env.local BEFORE importing anything that depends on env
import { config } from 'dotenv';
config({ path: '.env.local' });

const query = process.argv[2] || 'Impact of AI regulation on European economic competitiveness';
const format = (process.argv[3] as 'brief' | 'strategic') || 'brief';

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log(`║  NomosX — Pipeline Test (${format.padEnd(10)})                        ║`);
console.log('╚════════════════════════════════════════════════════════════╝');
console.log(`  Query: "${query}"`);
console.log(`  Format: ${format}`);
console.log(`  Started: ${new Date().toISOString()}\n`);

// Prevent fire-and-forget promise rejections (agent memory, witness learning, etc.)
// from changing the exit code after the pipeline completes successfully.
process.on('unhandledRejection', (reason) => {
  console.warn('[unhandledRejection] (non-fatal):', reason);
});

async function main() {
  const { runPipeline } = await import('../lib/agent/pipeline-v2');

  const start = Date.now();
  try {
    const result = await runPipeline(query, format as any, {
      perProvider: format === 'strategic' ? 30 : 20,
    });

    const durationMs = Date.now() - start;
    const durationMin = (durationMs / 60000).toFixed(1);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  PIPELINE RESULT                                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Result structure varies — print what we can
    if (result?.brief) {
      console.log(`  Title: ${result.brief.title || 'N/A'}`);
      console.log(`  Summary: ${(result.brief.summary || '').slice(0, 200)}...`);
    } else if (result?.analysis) {
      console.log(`  Title: ${result.analysis.title || 'N/A'}`);
      console.log(`  Summary: ${(result.analysis.summary || '').slice(0, 200)}...`);
    } else if (result?.title) {
      console.log(`  Title: ${result.title}`);
      console.log(`  Summary: ${(result.summary || '').slice(0, 200)}...`);
    }

    if (result?.sources) {
      console.log(`  Sources: ${result.sources.length}`);
    }
    if (result?.readings) {
      console.log(`  Readings: ${result.readings.length}`);
    }
    if (result?.costUsd !== undefined) {
      console.log(`  Cost: $${result.costUsd.toFixed(4)}`);
    }
    if (result?.pipelineRunId) {
      console.log(`  PipelineRun ID: ${result.pipelineRunId}`);
    }
    if (result?.html) {
      const htmlLen = result.html.length;
      console.log(`  HTML: ${htmlLen} chars`);
    }

    // Print all top-level keys for debugging
    console.log(`\n  Result keys: ${Object.keys(result).join(', ')}`);

    console.log(`\n  Duration: ${durationMin} min (${durationMs} ms)`);
    console.log(`  Finished: ${new Date().toISOString()}`);

    // Save HTML to file if present
    if (result?.html) {
      const fs = await import('fs');
      const outPath = `scripts/output-${format}-${Date.now()}.html`;
      fs.writeFileSync(outPath, result.html, 'utf-8');
      console.log(`  HTML saved to: ${outPath}`);
    } else if (result?.briefId) {
      // Pipeline returned briefId but no HTML — fetch from DB
      try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        const brief = await prisma.brief.findUnique({
          where: { id: result.briefId },
          select: { html: true },
        });
        if (brief?.html) {
          const fs = await import('fs');
          const outPath = `scripts/output-${format}-${Date.now()}.html`;
          fs.writeFileSync(outPath, brief.html, 'utf-8');
          console.log(`  HTML saved from DB to: ${outPath} (${brief.html.length} chars)`);
        }
        await prisma.$disconnect();
      } catch (dbErr) {
        console.warn('  Could not fetch HTML from DB:', dbErr);
      }
    }

    console.log('\n  ✅ Pipeline completed successfully\n');
    process.exitCode = 0;
    // Give pending fire-and-forget promises a chance to settle
    setTimeout(() => process.exit(0), 2000);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.error('\n  ❌ Pipeline FAILED\n');
    console.error(`  Error: ${err.message}`);
    if (err.stack) {
      console.error(`  Stack: ${err.stack.split('\n').slice(0, 5).join('\n')}`);
    }
    console.error(`  Duration: ${(durationMs / 60000).toFixed(1)} min`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
