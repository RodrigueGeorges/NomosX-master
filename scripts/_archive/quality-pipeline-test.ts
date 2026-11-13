/**
 * NomosX — Quality Pipeline Test & Audit
 *
 * USAGE:
 *   npx tsx scripts/quality-pipeline-test.ts audit          — scan all publications in DB
 *   npx tsx scripts/quality-pipeline-test.ts test           — run synthetic signal through pipeline
 *   npx tsx scripts/quality-pipeline-test.ts clean 80       — delete publications below score 80
 *   npx tsx scripts/quality-pipeline-test.ts clean 70       — delete publications below score 70
 *
 * REQUIREMENTS:
 *   - .env file with DATABASE_URL, OPENAI_API_KEY (or ANTHROPIC_API_KEY)
 *   - npm install + npx prisma generate
 *
 * INSTALL (first run on a new PC):
 *   npm install
 *   npx prisma generate
 *   npx tsx scripts/quality-pipeline-test.ts audit
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

// Load env
const envPath = path.join(process.cwd(), '.env.local');
const envFallback = path.join(process.cwd(), '.env');
dotenv.config({ path: fs.existsSync(envPath) ? envPath : envFallback });

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  red:   '\x1b[31m',
  cyan:  '\x1b[36m',
  white: '\x1b[37m',
  grey:  '\x1b[90m',
};
const ok  = (s: string) => `${C.green}✅ ${s}${C.reset}`;
const warn = (s: string) => `${C.yellow}⚡ ${s}${C.reset}`;
const fail = (s: string) => `${C.red}❌ ${s}${C.reset}`;
const info = (s: string) => `${C.cyan}ℹ  ${s}${C.reset}`;
const dim  = (s: string) => `${C.grey}${s}${C.reset}`;
const bold = (s: string) => `${C.bold}${s}${C.reset}`;

function scoreLabel(score: number | null): string {
  if (score === null || score === undefined) return dim('N/A');
  if (score >= 80) return `${C.green}${score}${C.reset}`;
  if (score >= 70) return `${C.yellow}${score}${C.reset}`;
  return `${C.red}${score}${C.reset}`;
}

function passAt(score: number | null, threshold: number): boolean {
  return score != null && score >= threshold;
}

function bar(score: number, width = 30): string {
  const filled = Math.round((score / 100) * width);
  const color = score >= 80 ? C.green : score >= 70 ? C.yellow : C.red;
  return `${color}${'█'.repeat(filled)}${C.grey}${'░'.repeat(width - filled)}${C.reset} ${scoreLabel(score)}`;
}

function sep(char = '─', len = 72) { return C.grey + char.repeat(len) + C.reset; }

// ─── Prisma ───────────────────────────────────────────────────────────────────
async function getPrisma() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ log: [] });
    await prisma.$queryRaw`SELECT 1`;
    return prisma;
  } catch (err: any) {
    console.error(fail(`Database connection failed: ${err.message}`));
    console.error(info('Check DATABASE_URL in your .env file.'));
    process.exit(1);
  }
}

// ─── MODE: audit ─────────────────────────────────────────────────────────────
async function runAudit() {
  console.log('\n' + bold('═'.repeat(72)));
  console.log(bold('  NomosX — Publication Quality Audit'));
  console.log(bold('  Thresholds: 70 (minimum) · 80 (target)'));
  console.log(bold('═'.repeat(72)) + '\n');

  const prisma = await getPrisma();

  const pubs = await (prisma as any).thinkTankPublication.findMany({
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      trustScore: true,
      qualityScore: true,
      citationCoverage: true,
      wordCount: true,
      sourceIds: true,
      publishedAt: true,
      html: true,
    },
  });

  if (pubs.length === 0) {
    console.log(info('No publications found in database.'));
    await (prisma as any).$disconnect();
    return;
  }

  // Categorise
  const passAt80: any[]  = [];
  const passAt70: any[]  = [];
  const below70: any[]   = [];

  for (const p of pubs) {
    const score = p.trustScore ?? p.qualityScore ?? 0;
    if (score >= 80)      passAt80.push(p);
    else if (score >= 70) passAt70.push(p);
    else                  below70.push(p);
  }

  // Summary table
  console.log(bold('  SUMMARY'));
  console.log(sep());
  console.log(`  Total publications :  ${bold(String(pubs.length))}`);
  console.log(`  ${C.green}Pass ≥80 (target)    :  ${passAt80.length}${C.reset}  ${dim('keep — high quality')}`);
  console.log(`  ${C.yellow}Pass ≥70 (minimum)   :  ${passAt70.length}${C.reset}  ${dim('keep — acceptable')}`);
  console.log(`  ${C.red}Below 70 (to delete) :  ${below70.length}${C.reset}  ${dim('delete recommended')}`);
  console.log(sep() + '\n');

  // Detail by category
  function printCategory(label: string, items: any[], color: string) {
    if (items.length === 0) return;
    console.log(`${color}${bold(`  ── ${label} (${items.length})`)}${C.reset}`);
    for (const p of items) {
      const trust   = p.trustScore ?? null;
      const quality = p.qualityScore ?? null;
      const score   = trust ?? quality ?? 0;
      const sources = Array.isArray(p.sourceIds) ? p.sourceIds.length : 0;
      const words   = p.wordCount ?? 0;
      const date    = p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : 'unknown';

      // Detect markdown artifacts
      const rawHtml = (p.html ?? '').replace(/^```html?\s*/i, '').replace(/\s*```$/, '').trim();
      const hasMarkdown = /^#{1,3}\s|\*\*[^*]+\*\*|^- /m.test(rawHtml.slice(0, 1000));

      console.log(`\n  ${dim(p.id.slice(0, 12)+'…')}  ${bold(p.title?.slice(0, 65) ?? '(no title)')}${p.title?.length > 65 ? '…' : ''}`);
      console.log(`    ${dim('Type:')} ${p.type}  ${dim('Date:')} ${date}  ${dim('Words:')} ${words}  ${dim('Sources:')} ${sources}`);
      console.log(`    Trust: ${bar(score)}  ${hasMarkdown ? warn('MARKDOWN artifacts') : ok('HTML clean')}`);
      if (trust !== null && quality !== null && Math.abs(trust - quality) > 10) {
        console.log(`    ${warn(`Trust/Quality gap: trust=${trust} vs quality=${quality}`)}`);
      }
    }
    console.log();
  }

  printCategory('PASS ≥80 — keep', passAt80, C.green);
  printCategory('PASS ≥70 — acceptable', passAt70, C.yellow);
  printCategory('BELOW 70 — delete', below70, C.red);

  // Markdown artifact summary
  const withMarkdown = pubs.filter((p: any) => {
    const raw = (p.html ?? '').replace(/^```html?\s*/i, '').replace(/\s*```$/, '').trim();
    return /^#{1,3}\s|\*\*[^*]+\*\*|^- /m.test(raw.slice(0, 1000));
  });

  if (withMarkdown.length > 0) {
    console.log(sep());
    console.log(warn(`${withMarkdown.length} publication(s) have Markdown artifacts and render incorrectly.`));
    console.log(info('Run: npx tsx scripts/quality-pipeline-test.ts fix-markdown'));
    console.log(sep() + '\n');
  }

  console.log(info('To delete below-70 publications:'));
  console.log(dim('  npx tsx scripts/quality-pipeline-test.ts clean 70\n'));

  await (prisma as any).$disconnect();
}

// ─── MODE: test (synthetic pipeline run) ──────────────────────────────────────
async function runPipelineTest() {
  console.log('\n' + bold('═'.repeat(72)));
  console.log(bold('  NomosX — Synthetic Pipeline Quality Test'));
  console.log(bold('  Runs: Critical Loop V2 + Editorial Gate checks'));
  console.log(bold('═'.repeat(72)) + '\n');

  // Synthetic high-quality article: EU AI Act implementation
  const syntheticArticle = {
    html: `
<h1>EU AI Act: Implementation Challenges and Strategic Implications for Industry</h1>

<h2>Executive Summary</h2>
<p>The European Union's Artificial Intelligence Act (AIA), entering into force in August 2024 with phased
compliance windows through 2027, represents the world's first comprehensive horizontal AI regulation framework.
This brief analyses the Act's risk-based classification system, examines compliance burdens on high-risk AI
deployers, and evaluates strategic adaptation options for affected industries. Evidence drawn from 12 regulatory
impact assessments and practitioner surveys suggests that compliance costs for large enterprises may reach
€25,000–€200,000 per high-risk system annually [SRC-1][SRC-2], while SME exemptions remain contested and
insufficiently operationalised [SRC-3].</p>

<h2>Regulatory Architecture</h2>
<p>The AIA establishes a four-tier risk pyramid: (1) unacceptable-risk systems facing outright prohibition,
including social scoring by public authorities [SRC-4]; (2) high-risk applications requiring conformity
assessment, quality management systems, and registration in the EU database; (3) limited-risk systems subject
to transparency obligations; and (4) minimal-risk systems facing no mandatory requirements [SRC-1].</p>
<p>High-risk categorisation encompasses AI deployed in critical infrastructure, education, employment, law
enforcement, border control, and justice administration. Annexes III and IV specify technical documentation,
data governance, and human oversight standards that must be satisfied before market placement [SRC-5].</p>

<h2>Compliance Cost Evidence</h2>
<p>A November 2024 impact assessment commissioned by the European Parliament Research Service estimated median
compliance costs at €71,000 per high-risk system for large enterprises and €29,000 for medium-sized firms
[SRC-2]. A subsequent PwC survey of 340 European technology companies found 61% had already commenced internal
audits, while 34% reported uncertainty about their classification status [SRC-6].</p>
<p>Legal uncertainty concentrates in three areas: (i) the boundary between high-risk and limited-risk in
hybrid systems, (ii) extraterritorial applicability to non-EU developers whose systems operate within the EU
market, and (iii) the interaction with sector-specific regulation in financial services and medical devices
[SRC-3][SRC-7].</p>

<h2>Industry Adaptation Strategies</h2>
<p>Evidence from early compliance programmes identifies three dominant strategies. First, reclassification:
firms redesigning AI products to avoid Annex III triggers by restricting functionality or adding human decision
layers [SRC-8]. Second, jurisdictional hedging: structuring deployments to serve EU customers from non-EU
entities pending enforcement clarity [SRC-9]. Third, compliance-as-differentiation: positioning conformity
with AIA as a trust signal to enterprise buyers in regulated sectors [SRC-6].</p>
<p>The reclassification strategy carries significant risk if enforcement authorities adopt expansive
interpretations of Annex III categories, as suggested by early guidance from the AI Office established under
the Act [SRC-10].</p>

<h2>Limits and Uncertainties</h2>
<p>Cost estimates rely on pre-enforcement projections and may understate adaptation costs in sectors lacking
prior AI governance experience. The AI Office's interpretive authority and enforcement posture remain
incompletely defined, making forward-looking strategy formation difficult. Evidence on SME-specific compliance
pathways is sparse; available data conflates micro-enterprises with firms employing up to 249 staff [SRC-11].</p>

<h2>What Would Change Our Assessment</h2>
<p>Materially more restrictive enforcement guidance from the AI Office, particularly on hybrid system
classification, would increase compliance burden estimates significantly. Conversely, successful mutual
recognition agreements between the EU and major trading partners would reduce the strategic value of
jurisdictional hedging approaches [SRC-12].</p>
`,
    sources: [
      { id: 'src-1', title: 'Regulation (EU) 2024/1689 on Artificial Intelligence', provider: 'eu-official', qualityScore: 95, year: 2024, citationCount: 0 },
      { id: 'src-2', title: 'AI Act Impact Assessment: Compliance Costs for European Enterprises', provider: 'europarl', qualityScore: 88, year: 2024, citationCount: 45 },
      { id: 'src-3', title: 'SME Challenges under the EU AI Act: A Legal Analysis', provider: 'crossref', qualityScore: 78, year: 2025, citationCount: 12 },
      { id: 'src-4', title: 'Social Scoring Prohibitions in the EU AI Act', provider: 'openalex', qualityScore: 82, year: 2024, citationCount: 28 },
      { id: 'src-5', title: 'Conformity Assessment Procedures for High-Risk AI Systems', provider: 'eu-official', qualityScore: 90, year: 2024, citationCount: 0 },
      { id: 'src-6', title: 'European AI Compliance Survey 2025', provider: 'pwc-research', qualityScore: 74, year: 2025, citationCount: 8 },
      { id: 'src-7', title: 'Interaction between the AI Act and Financial Services Regulation', provider: 'crossref', qualityScore: 81, year: 2025, citationCount: 19 },
      { id: 'src-8', title: 'Reclassification Strategies under the EU AI Act', provider: 'openalex', qualityScore: 76, year: 2025, citationCount: 6 },
      { id: 'src-9', title: 'Extraterritorial Application of the AI Act', provider: 'crossref', qualityScore: 84, year: 2025, citationCount: 31 },
      { id: 'src-10', title: 'AI Office Guidance on Annex III High-Risk Categories', provider: 'eu-official', qualityScore: 91, year: 2025, citationCount: 0 },
      { id: 'src-11', title: 'SME Definition and AI Act Scope', provider: 'openalex', qualityScore: 72, year: 2025, citationCount: 4 },
      { id: 'src-12', title: 'International AI Governance Convergence and Mutual Recognition', provider: 'crossref', qualityScore: 79, year: 2025, citationCount: 22 },
    ],
  };

  // Check dependencies
  let runCriticalLoop: Function | null = null;
  try {
    const mod = await import('../lib/agent/critical-loop-v2');
    runCriticalLoop = mod.runCriticalLoopV2;
    console.log(ok('critical-loop-v2 loaded'));
  } catch (err: any) {
    console.log(fail(`Cannot load critical-loop-v2: ${err.message}`));
    console.log(info('Ensure OPENAI_API_KEY or ANTHROPIC_API_KEY is set.'));
    return;
  }

  // ── Stage 1: Pre-flight checks ──────────────────────────────────────────────
  console.log('\n' + bold('  STAGE 0 — Pre-flight quality checks'));
  console.log(sep('─'));

  const wordCount = syntheticArticle.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const citations = (syntheticArticle.html.match(/\[SRC-\d+\]/g) ?? []).length;
  const uniqueCitations = new Set(syntheticArticle.html.match(/\[SRC-\d+\]/g) ?? []).size;
  const hasForbidden = /il est clair que|it is clear that|sans aucun doute|without a doubt|experts agree|la science a tranché/i.test(syntheticArticle.html);
  const hasSections = (syntheticArticle.html.match(/<h[23]/gi) ?? []).length;

  console.log(`  Word count    : ${wordCount >= 600 ? ok(String(wordCount)) : fail(String(wordCount))} ${dim('(min 600)')}`);
  console.log(`  Citation tags : ${citations >= 8 ? ok(String(citations)) : warn(String(citations))} ${dim('(min 8 recommended)')}`);
  console.log(`  Unique sources: ${uniqueCitations >= 8 ? ok(String(uniqueCitations)) : warn(String(uniqueCitations))} ${dim('(min 8 recommended)')}`);
  console.log(`  Sections (h2/h3): ${hasSections >= 4 ? ok(String(hasSections)) : warn(String(hasSections))} ${dim('(min 4 recommended)')}`);
  console.log(`  Forbidden phrases: ${hasForbidden ? fail('FOUND') : ok('clean')}`);

  // ── Stage 2: Critical Loop V2 ───────────────────────────────────────────────
  console.log('\n' + bold('  STAGE 1 — Critical Loop V2'));
  console.log(sep('─'));
  console.log(dim('  Running methodology judge + adversarial reviewer + calibration assessor...'));
  console.log(dim('  This calls the LLM — takes ~30–60s.\n'));

  const loopStart = Date.now();
  let loopResult: any = null;
  try {
    loopResult = await runCriticalLoop!({
      draftHtml: syntheticArticle.html,
      sources: syntheticArticle.sources,
      maxIterations: 2,
      publishThreshold: 65,
    });
    const elapsed = ((Date.now() - loopStart) / 1000).toFixed(1);

    console.log(`  Duration         : ${elapsed}s  (iterations: ${loopResult.iterations})`);
    console.log(`  Composite score  : ${bar(loopResult.compositeScore)}`);
    console.log(`  Methodology      : ${bar(loopResult.methodology.overallScore)}  ${dim('threshold ≥60')}`);
    console.log(`  Adversarial      : ${bar(loopResult.adversarial.overallScore)}  ${dim('threshold ≥55')}`);
    console.log(`  Calibration      : ${bar(loopResult.calibration.overallScore)}  ${dim('threshold ≥50')}`);

    if (loopResult.iterationHistory?.length > 1) {
      console.log(`\n  ${dim('Iteration history:')}`);
      for (const h of loopResult.iterationHistory) {
        console.log(`    Iter ${h.iteration}: composite=${h.compositeScore} | method=${h.methodology} | adv=${h.adversarial} | calib=${h.calibration}${h.rewrote ? ' → rewrote' : ''}`);
      }
    }

    if (loopResult.methodology.concerns?.length > 0) {
      console.log(`\n  ${C.yellow}Methodology concerns:${C.reset}`);
      loopResult.methodology.concerns.slice(0, 3).forEach((c: string) => console.log(`    • ${c}`));
    }
    if (loopResult.adversarial.blindSpots?.length > 0) {
      console.log(`\n  ${C.yellow}Blind spots flagged:${C.reset}`);
      loopResult.adversarial.blindSpots.slice(0, 3).forEach((b: string) => console.log(`    • ${b}`));
    }

    console.log(`\n  Cost            : $${loopResult.totalCostUsd?.toFixed(4) ?? '?'}`);

  } catch (err: any) {
    console.log(fail(`Critical Loop failed: ${err.message}`));
    if (err.message?.includes('API') || err.message?.includes('key')) {
      console.log(info('Check your LLM API key (OPENAI_API_KEY / ANTHROPIC_API_KEY).'));
    }
    return;
  }

  // ── Stage 3: Editorial gate simulation ─────────────────────────────────────
  console.log('\n' + bold('  STAGE 2 — Editorial Gate Simulation'));
  console.log(sep('─'));

  const composite = loopResult.compositeScore;
  const trustScore = Math.round(
    composite * 0.6 +
    (loopResult.methodology.overallScore ?? 0) * 0.2 +
    (uniqueCitations / syntheticArticle.sources.length) * 100 * 0.2
  );

  const checks = {
    methodology:  { pass: loopResult.methodology.overallScore >= 60,  score: loopResult.methodology.overallScore },
    adversarial:  { pass: loopResult.adversarial.overallScore >= 55,   score: loopResult.adversarial.overallScore },
    calibration:  { pass: loopResult.calibration.overallScore >= 50,   score: loopResult.calibration.overallScore },
    citation:     { pass: uniqueCitations >= 4,                         score: Math.round((uniqueCitations / Math.max(syntheticArticle.sources.length, 1)) * 100) },
    forbidden:    { pass: !hasForbidden,                                score: hasForbidden ? 0 : 100 },
    wordCount:    { pass: wordCount >= 300,                             score: Math.min(100, Math.round((wordCount / 800) * 100)) },
  };

  for (const [name, check] of Object.entries(checks)) {
    const icon = check.pass ? ok('PASS') : fail('FAIL');
    console.log(`  ${name.padEnd(14)}: ${icon}  score=${bar(check.score, 20)}`);
  }

  const allHardPass = checks.citation.pass && checks.forbidden.pass && checks.wordCount.pass;
  const allSoftPass = checks.methodology.pass && checks.adversarial.pass && checks.calibration.pass;

  const decision = !allHardPass ? 'REJECT' : !allSoftPass ? 'HOLD — human review required' : trustScore >= 65 ? 'PUBLISH' : 'HOLD';

  console.log('\n  ' + sep('─', 40));
  console.log(`  Editorial decision : ${bold(decision)}`);
  console.log(`  Estimated trust score: ${bar(trustScore)}`);

  // ── Stage 3: Threshold analysis ─────────────────────────────────────────────
  console.log('\n' + bold('  STAGE 3 — Threshold Analysis'));
  console.log(sep('─'));

  const T70 = passAt(trustScore, 70);
  const T80 = passAt(trustScore, 80);

  console.log(`  Would appear at threshold 70 : ${T70 ? ok('YES — visible to readers') : fail('NO — hidden from listing')}`);
  console.log(`  Would appear at threshold 80 : ${T80 ? ok('YES — high quality bar') : warn('NO — below target quality')}`);

  if (!T80 && T70) {
    console.log(`\n  ${warn('Score is between 70–80. Consider:')}`);
    console.log(dim('   • Expanding source depth (add 3+ academic sources)'));
    console.log(dim('   • Strengthening the "Limits & Uncertainties" section'));
    console.log(dim('   • Adding a stronger steel-man counter-argument'));
  } else if (!T70) {
    console.log(`\n  ${fail('Score is below 70. This publication should NOT be published.')}`);
    console.log(dim('   • Rewrite with more verifiable claims'));
    console.log(dim('   • Add [SRC-N] citations to every factual statement'));
    console.log(dim('   • Remove speculative assertions without evidence'));
  } else {
    console.log(`\n  ${ok('Score meets the 80+ target quality bar.')}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n' + bold('═'.repeat(72)));
  console.log(bold(`  PIPELINE TEST COMPLETE`));
  console.log(bold('═'.repeat(72)));
  console.log(`  Article quality  : ${bar(trustScore)}`);
  console.log(`  Pass 70 (public) : ${T70 ? ok('yes') : fail('no')}`);
  console.log(`  Pass 80 (target) : ${T80 ? ok('yes') : warn('no')}`);
  console.log(`  Decision         : ${bold(decision)}\n`);
}

// ─── MODE: clean ─────────────────────────────────────────────────────────────
async function runClean(thresholdArg: string | undefined) {
  const threshold = parseInt(thresholdArg ?? '70', 10);
  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    console.error(fail('Invalid threshold. Use a number between 0 and 100.'));
    process.exit(1);
  }

  console.log('\n' + bold('═'.repeat(72)));
  console.log(bold(`  NomosX — Delete publications below score ${threshold}`));
  console.log(bold('═'.repeat(72)) + '\n');

  const prisma = await getPrisma();

  const toDelete = await (prisma as any).thinkTankPublication.findMany({
    where: {
      AND: [
        { OR: [{ trustScore: { lt: threshold } }, { trustScore: null }] },
        { OR: [{ qualityScore: { lt: threshold } }, { qualityScore: null }] },
      ]
    },
    select: { id: true, title: true, trustScore: true, qualityScore: true, type: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
  });

  if (toDelete.length === 0) {
    console.log(ok(`No publications found below threshold ${threshold}. Nothing to delete.`));
    await (prisma as any).$disconnect();
    return;
  }

  console.log(warn(`Found ${toDelete.length} publication(s) below score ${threshold}:\n`));

  for (const p of toDelete) {
    const score = p.trustScore ?? p.qualityScore ?? 'N/A';
    const date = p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : 'no date';
    console.log(`  ${dim(p.id.slice(0, 12)+'…')}  score=${scoreLabel(score)}  [${p.type}]  ${p.title?.slice(0, 60) ?? '(no title)'}  ${dim(date)}`);
  }

  console.log();

  // Confirm
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve =>
    rl.question(warn(`Delete these ${toDelete.length} publication(s)? Type YES to confirm: `), resolve)
  );
  rl.close();

  if (answer.trim().toUpperCase() !== 'YES') {
    console.log(info('Aborted — nothing deleted.'));
    await (prisma as any).$disconnect();
    return;
  }

  const ids = toDelete.map((p: any) => p.id);
  const result = await (prisma as any).thinkTankPublication.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(ok(`Deleted ${result.count} publication(s).`));
  await (prisma as any).$disconnect();
}

// ─── MODE: fix-markdown ───────────────────────────────────────────────────────
async function runFixMarkdown() {
  console.log('\n' + bold('═'.repeat(72)));
  console.log(bold('  NomosX — Fix Markdown artifacts in publications'));
  console.log(bold('═'.repeat(72)) + '\n');

  const prisma = await getPrisma();

  const pubs = await (prisma as any).thinkTankPublication.findMany({
    select: { id: true, title: true, html: true },
  });

  let fixed = 0;
  for (const p of pubs) {
    const raw = (p.html ?? '').replace(/^```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const hasMarkdown = /^#{1,3}\s|\*\*[^*]+\*\*|^- /m.test(raw.slice(0, 1000));
    if (!hasMarkdown) continue;

    // Convert Markdown to basic HTML
    let html = raw
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/^(?!<[hul])(.+)$/gm, (line) => line.trim() ? line : '');

    if (!html.startsWith('<')) html = `<p>${html}</p>`;

    await (prisma as any).thinkTankPublication.update({
      where: { id: p.id },
      data: { html },
    });

    console.log(ok(`Fixed: ${p.title?.slice(0, 60) ?? p.id}`));
    fixed++;
  }

  if (fixed === 0) console.log(ok('No Markdown artifacts found. All publications are clean HTML.'));
  else console.log(`\n${ok(`Fixed ${fixed} publication(s).`)}`);

  await (prisma as any).$disconnect();
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const [,, mode, arg] = process.argv;

  switch (mode) {
    case 'audit':
      await runAudit();
      break;
    case 'test':
      await runPipelineTest();
      break;
    case 'clean':
      await runClean(arg);
      break;
    case 'fix-markdown':
      await runFixMarkdown();
      break;
    default:
      console.log(`
${bold('NomosX Quality Pipeline Test')}

Usage:
  ${C.cyan}npx tsx scripts/quality-pipeline-test.ts audit${C.reset}
    → Scan all publications in DB and show quality scores

  ${C.cyan}npx tsx scripts/quality-pipeline-test.ts test${C.reset}
    → Run a synthetic article through the full pipeline (needs LLM API key)

  ${C.cyan}npx tsx scripts/quality-pipeline-test.ts clean 80${C.reset}
    → Delete publications with score below 80 (interactive confirmation)

  ${C.cyan}npx tsx scripts/quality-pipeline-test.ts clean 70${C.reset}
    → Delete publications with score below 70 (interactive confirmation)

  ${C.cyan}npx tsx scripts/quality-pipeline-test.ts fix-markdown${C.reset}
    → Convert Markdown artifacts to proper HTML

First time on a new PC:
  ${C.grey}npm install
  npx prisma generate
  npx tsx scripts/quality-pipeline-test.ts audit${C.reset}
`);
  }
}

main().catch(err => {
  console.error(fail(`Fatal: ${err.message}`));
  process.exit(1);
});
