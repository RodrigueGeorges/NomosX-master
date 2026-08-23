#!/usr/bin/env tsx
/**
 * Smoke test — Editorial V2 (position-first brief pipeline)
 *
 * Usage:
 *   npx tsx scripts/smoke-editorial-v2.ts           # unit + live classify/casting
 *   npx tsx scripts/smoke-editorial-v2.ts --full    # + full brief pipeline (slow, ~$2-4)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

process.env.EDITORIAL_V2 = 'true';

const QUERY =
  process.argv.find((a) => a.startsWith('--query='))?.slice(8) ??
  'How do carbon border adjustments interact with AI-driven supply chain automation?';

const FULL = process.argv.includes('--full');

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function phaseUnit() {
  console.log('\n══ Phase A — deterministic (no API) ══\n');

  const { isEditorialV2Enabled } = await import('../lib/agent/editorial-config');
  const { ensureEditorialScenarios } = await import('../lib/agent/editorial-scenarios');
  const { renderPositionFirstBriefHTML } = await import('../lib/agent/position-first-renderer');
  const {
    extractBriefSummary,
    isPositionFirstBrief,
    extractInstituteVerdict,
  } = await import('../lib/agent/brief-html-extract');

  ok('EDITORIAL_V2 flag', isEditorialV2Enabled());

  const analysis = ensureEditorialScenarios(
    {
      summary: 'Carbon pricing shifts trade flows while automation compresses margins.',
      consensus: 'Joint policy-tech friction is under-modeled in current literature.',
      disagreements: 'Automation may offset compliance costs faster than regulators assume.',
      debate: { pro: 'Accelerated decarbonization via tech', con: 'Regulatory arbitrage risk' },
    },
    { question: QUERY }
  );
  const scenarios = analysis.scenarios as Array<{ name: string }>;
  ok('ensureEditorialScenarios ≥2', scenarios.length >= 2, `${scenarios.length} scenarios`);

  const classification = {
    primaryDomain: 'climate' as const,
    domains: [{ domain: 'climate' as const, confidence: 0.9, reasoning: 'test' }],
    dimensions: [
      { domain: 'climate', label: 'Climate policy', angle: 'Carbon border mechanisms' },
      { domain: 'technology', label: 'Automation', angle: 'AI supply chain optimization' },
    ],
    detectedSubject: 'Carbon border adjustments × AI supply chain automation',
    verticalSlug: 'climate',
    secondaryVerticals: [],
    researchers: [],
    providers: ['openalex'],
    urgency: 'high' as const,
    recommendedTier: 'standard' as const,
    isCrossDomain: true,
    reasoning: 'fixture',
    confidence: 0.85,
    costUsd: 0,
  };

  const casting = {
    team: [
      { lensId: 'climate', domain: 'Climate policy', role: 'lead' as const, mandate: 'Test mandate' },
      {
        lensId: 'technology',
        domain: 'Automation',
        role: 'friction' as const,
        mandate: 'Friction mandate',
        frictionWith: 'Climate policy',
      },
    ],
    collisionSummary: 'Climate policy × Automation',
    productiveFriction: 'Automation stress-tests climate assumptions.',
    costUsd: 0,
  };

  const position = {
    headline: 'Climate policy × Automation',
    verdict: 'NomosX provisionally holds that border adjustments accelerate when automation reduces compliance friction [SRC-1].',
    confidence: 72,
    confidenceLabel: 'medium' as const,
    scenarios: scenarios.map((s, i) => ({
      name: s.name,
      probability: i === 0 ? '50%' : '30%',
      description: `Scenario ${s.name} description for smoke test.`,
    })),
    dominantScenario: scenarios[0]?.name,
    objections: ['Automation offsets may be overstated'],
    whatChangesMind: ['New empirical trade elasticity data'],
    costUsd: 0,
  };

  const sources = [
    { title: 'Carbon Border Adjustments and Trade', provider: 'openalex', year: 2024 },
    { title: 'AI in Global Supply Chains', provider: 'crossref', year: 2023 },
  ];

  const html = renderPositionFirstBriefHTML({
    question: QUERY,
    classification,
    casting,
    position,
    analysis: analysis as Record<string, unknown>,
    sources,
    isStrategic: false,
  });

  ok('HTML: position-first marker', isPositionFirstBrief(html));
  ok('HTML: Detected subject', html.includes('Detected subject'));
  ok('HTML: Dedicated team', html.includes('Dedicated team'));
  ok('HTML: Probable futures', html.includes('Probable futures'));
  ok('HTML: Institute position', html.includes('Institute position'));
  ok('HTML: collision line', html.includes('Climate policy × Automation'));

  const summary = extractBriefSummary(html);
  ok('extractBriefSummary', summary.length > 40, summary.slice(0, 80) + '…');

  const verdict = extractInstituteVerdict(html);
  ok('extractInstituteVerdict', verdict.includes('provisionally'), verdict.slice(0, 60) + '…');
}

async function phaseLiveClassify() {
  console.log('\n══ Phase B — live classify + casting ══\n');

  if (!process.env.OPENAI_API_KEY) {
    console.log('  ⚠️  OPENAI_API_KEY missing — skipping Phase B');
    return;
  }

  const { classifyTopic } = await import('../lib/agent/topic-classifier');
  const { castingAgent } = await import('../lib/agent/casting-agent');

  const classification = await classifyTopic(QUERY);
  ok('classifyTopic dimensions', classification.dimensions.length >= 1, `${classification.dimensions.length} dims`);
  ok('classifyTopic detectedSubject', classification.detectedSubject.length > 10);
  console.log(`     collision: ${classification.dimensions.map((d) => d.label).join(' × ') || 'n/a'}`);
  console.log(`     subject: ${classification.detectedSubject.slice(0, 100)}…`);

  const casting = await castingAgent(QUERY, classification);
  ok('castingAgent team', casting.team.length >= 1, `${casting.team.length} lenses`);
  ok('castingAgent friction', casting.productiveFriction.length > 10);
  console.log(`     team: ${casting.team.map((t) => `${t.role}:${t.domain}`).join(', ')}`);
}

async function phaseFullPipeline() {
  console.log('\n══ Phase C — full brief pipeline (EDITORIAL_V2) ══\n');

  if (!process.env.DATABASE_URL || !process.env.OPENAI_API_KEY) {
    console.log('  ⚠️  DATABASE_URL or OPENAI_API_KEY missing — skipping Phase C');
    return;
  }

  if (process.env.OPENAI_API_KEY.includes('placeholder') || process.env.OPENAI_API_KEY.startsWith('sk-place')) {
    console.log('  ⚠️  OPENAI_API_KEY looks like a placeholder — Phase C needs a valid key');
    return;
  }

  const { prisma } = await import('../lib/db');
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('  ⚠️  Database unreachable (localhost:5432?) — skipping Phase C');
    console.log('     Start Postgres or update DATABASE_URL in .env.local');
    return;
  }

  const { runPipeline } = await import('../lib/agent/pipeline-v2');

  const start = Date.now();
  console.log(`  Query: "${QUERY}"`);
  console.log('  Providers: openalex, crossref | perProvider: 5 | budget: brief default\n');

  const result = await runPipeline(QUERY, 'brief', {
    providers: ['openalex', 'crossref'] as any,
    perProvider: 5,
    useThinkTankPack: true,
    policyCouncil: true,
    useSelfEvolution: true,
  });

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  const stats = result.stats as Record<string, unknown>;

  ok('pipeline completed', Boolean(result.briefId), `brief ${result.briefId}`);
  ok('stats.editorialV2', stats.editorialV2 === true);
  ok('stats.casting', Boolean(stats.casting));
  ok('stats.editorialArbiter', Boolean(stats.editorialArbiter));

  const brief = await prisma.brief.findUnique({
    where: { id: result.briefId },
    select: { html: true, lineage: true },
  });

  const html = brief?.html ?? '';
  const { isPositionFirstBrief, extractInstituteVerdict } = await import('../lib/agent/brief-html-extract');

  ok('brief HTML position-first', isPositionFirstBrief(html));
  ok('brief has Institute position section', html.includes('Institute position'));
  ok('brief has Dedicated team', html.includes('Dedicated team'));
  ok('brief has Probable futures', html.includes('Probable futures'));

  const verdict = extractInstituteVerdict(html);
  ok('brief verdict extracted', verdict.length > 50, `${verdict.length} chars`);

  const arbiter = stats.editorialArbiter as { confidence?: number; scenariosCount?: number };
  console.log(`\n  Arbiter confidence: ${arbiter?.confidence ?? 'n/a'}`);
  console.log(`  Scenarios: ${arbiter?.scenariosCount ?? 'n/a'}`);
  console.log(`  Foresight: ${JSON.stringify(stats.foresight ?? { skipped: true })}`);
  console.log(`  Duration: ${duration}s`);

  await prisma.$disconnect();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     NomosX — Smoke test Editorial V2 (position-first)   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nEDITORIAL_V2=${process.env.EDITORIAL_V2}`);
  console.log(`Mode: ${FULL ? 'FULL (A+B+C)' : 'FAST (A+B)'}`);

  await phaseUnit();
  await phaseLiveClassify();
  if (FULL) await phaseFullPipeline();

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n💥 Smoke test crashed:', err);
  process.exit(1);
});
