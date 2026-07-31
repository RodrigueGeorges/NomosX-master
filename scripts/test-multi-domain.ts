/**
 * Multi-Domain Publication Test — runs the pipeline across diverse domains
 * to verify the pipeline can publish expert-level analysis on any topic.
 *
 * Usage:
 *   node --import tsx scripts/test-multi-domain.ts              # all domains
 *   node --import tsx scripts/test-multi-domain.ts technology    # single domain
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const DOMAIN_QUERIES: Record<string, string[]> = {
  technology: [
    'What are the structural vulnerabilities in large language models that enable adversarial attacks, and what mitigation strategies exist to enhance their security?',
  ],
  economics: [
    'How do carbon pricing mechanisms affect industrial competitiveness, and what evidence exists for leakage versus innovation effects?',
  ],
  health: [
    'What is the evidence base for intermittent fasting versus caloric restriction in metabolic syndrome management, and what are the methodological limitations of current trials?',
  ],
  climate: [
    'What are the feasibility constraints of direct air capture deployment at scale, and how do they compare to natural carbon sinks in climate mitigation scenarios?',
  ],
  geopolitics: [
    'How are semiconductor export controls reshaping global supply chains, and what are the second-order effects on innovation and military parity?',
  ],
  finance: [
    'What structural risks does the private credit boom pose to financial stability, and how do they compare to the 2008 shadow banking vulnerabilities?',
  ],
};

const targetDomain = process.argv[2];
const domains = targetDomain ? [targetDomain] : Object.keys(DOMAIN_QUERIES);

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  NomosX — MULTI-DOMAIN PUBLICATION TEST                    ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log(`  Domains: ${domains.join(', ')}`);
console.log(`  Started: ${new Date().toISOString()}\n`);

async function main() {
  const start = Date.now();
  const { runAndPublishInquiry } = await import('../lib/agent/inquiry-orchestrator');

  const results: Array<{
    domain: string;
    query: string;
    status: string;
    trust: number;
    quality: number;
    words: number;
    cost: number;
    durationMs: number;
    gateDecision?: string;
    readinessOk?: boolean;
    error?: string;
  }> = [];

  for (const domain of domains) {
    const queries = DOMAIN_QUERIES[domain] || [];
    for (const query of queries) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  DOMAIN: ${domain.toUpperCase()} — Running inquiry`);
      console.log(`  Query: "${query.slice(0, 80)}..."`);
      console.log(`  Started: ${new Date().toISOString()}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      const qStart = Date.now();
      try {
        const result = await runAndPublishInquiry({
          question: query,
          depth: 'strategic',
          source: 'manual',
          skipDuplicateCheck: true,
          minTrustScore: 60,
        });

        const entry = {
          domain,
          query,
          status: result.status,
          trust: result.trustScore ?? 0,
          quality: result.qualityScore ?? 0,
          words: result.wordCount ?? 0,
          cost: result.costUsd,
          durationMs: Date.now() - qStart,
          gateDecision: result.gate?.decision,
          readinessOk: result.readinessOk,
          error: result.error,
        };
        results.push(entry);

        console.log(`\n  ── ${domain.toUpperCase()} RESULT ──`);
        console.log(`  Status: ${result.status}`);
        console.log(`  Trust: ${result.trustScore}`);
        console.log(`  Quality: ${result.qualityScore}`);
        console.log(`  Words: ${result.wordCount}`);
        console.log(`  Cost: $${result.costUsd.toFixed(4)}`);
        console.log(`  Duration: ${((Date.now() - qStart) / 1000).toFixed(1)}s`);
        if (result.gate) {
          console.log(`  Gate: ${result.gate.decision} (metrics: ${JSON.stringify(result.gate.metrics)})`);
        }
        if (result.readinessOk !== undefined) console.log(`  Readiness: ${result.readinessOk}`);
        if (result.publicationId) console.log(`  Publication ID: ${result.publicationId}`);
        if (result.error) console.log(`  Error: ${result.error}`);

        if (result.pipeline?.html) {
          const fs = await import('fs');
          const filename = `scripts/output-${domain}.html`;
          fs.writeFileSync(filename, result.pipeline.html, 'utf-8');
          console.log(`  HTML saved: ${filename} (${result.pipeline.html.length} chars)`);
        }
      } catch (err: any) {
        console.error(`  ❌ ${domain} failed:`, err.message);
        results.push({
          domain,
          query,
          status: 'failed',
          trust: 0,
          quality: 0,
          words: 0,
          cost: 0,
          durationMs: Date.now() - qStart,
          error: err.message,
        });
      }
    }
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  MULTI-DOMAIN SUMMARY                                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let published = 0;
  let held = 0;
  let failed = 0;
  let totalCost = 0;

  for (const r of results) {
    const icon = r.status === 'published' ? '✅' : r.status === 'held' ? '⏸️' : '❌';
    console.log(`  ${icon} ${r.domain.toUpperCase().padEnd(12)} | ${r.status.padEnd(10)} | T:${r.trust} Q:${r.quality} W:${r.words} | $${r.cost.toFixed(4)} | ${(r.durationMs / 1000).toFixed(0)}s`);
    if (r.gateDecision) console.log(`     Gate: ${r.gateDecision}, Readiness: ${r.readinessOk}`);
    if (r.error) console.log(`     Error: ${r.error}`);

    if (r.status === 'published') published++;
    else if (r.status === 'held') held++;
    else failed++;
    totalCost += r.cost;
  }

  console.log(`\n  Published: ${published}/${results.length}`);
  console.log(`  Held: ${held}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total cost: $${totalCost.toFixed(4)}`);
  console.log(`  Total duration: ${((Date.now() - start) / 60000).toFixed(1)} min`);
  console.log(`  Finished: ${new Date().toISOString()}`);

  if (published > 0) {
    console.log('\n  ✅ Multi-domain publication successful!\n');
  } else {
    console.log('\n  ⚠️  No publications — review gate metrics above\n');
  }

  process.exit(published > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
