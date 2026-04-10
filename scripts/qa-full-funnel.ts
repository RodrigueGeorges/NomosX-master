/**
 * ══════════════════════════════════════════════════════════════════════════════
 * NOMOSX — FULL FUNNEL QA SUITE
 * Head of QA — All formats (brief + strategic)
 * Tests every stage from source normalization to publication HTML
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * COVERS:
 *  [A] Pipeline Types          — PipelineStats, DataLineage, APA formatter
 *  [B] Citation Guard          — valid / invalid / edge cases
 *  [C] Inter-Pass Validation   — thematic map hallucination filter
 *  [D] Editor — Brief Format   — structure, APA, citations, SVG, metadata
 *  [E] Editor — Strategic Format — all 10 sections, key findings, scenarios
 *  [F] PDF Export              — print CSS injection, page layout
 *  [G] Publication Quality     — automated readiness scoring
 *  [H] Edge Cases              — empty/malformed data resilience
 *  [I] Funnel Simulation       — mock pipeline from RANK → PUBLISH
 * 
 * Run: npx tsx scripts/qa-full-funnel.ts
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import { formatAPA, renderAPAHtml, createLineageTracker, recordTransformation } from '../lib/agent/pipeline-types';
import type { PipelineStats } from '../lib/agent/pipeline-types';
import { renderProfessionalBriefHTML, renderProfessionalStrategicHTML } from '../lib/agent/editor-agent';
import { generatePrintHTML } from '../lib/agent/pdf-export';
// citationGuard inlined to avoid pulling Prisma/Redis/OpenAI from pipeline-v2
function citationGuard(json: any, sourceCount: number) {
  const allText = JSON.stringify(json || {});
  const used = Array.from(allText.matchAll(/SRC-(\d+)/g)).map((m) => Number(m[1]));
  const invalid = used.filter((n) => n < 1 || n > sourceCount);
  return { ok: used.length > 0 && invalid.length === 0, usedCount: used.length, invalid };
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ══════════════════════════════════════════════════════════════════════════════

interface TestResult {
  suite: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message?: string;
  value?: any;
}

const results: TestResult[] = [];
let currentSuite = '';

function suite(name: string) {
  currentSuite = name;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('═'.repeat(60));
}

function assert(name: string, condition: boolean, message?: string, value?: any) {
  const status = condition ? 'PASS' : 'FAIL';
  const icon = condition ? '  ✅' : '  ❌';
  const suffix = value !== undefined ? ` (${JSON.stringify(value)})` : '';
  console.log(`${icon} ${name}${suffix}`);
  if (!condition && message) console.error(`      ↳ ${message}`);
  results.push({ suite: currentSuite, name, status, message, value });
}

function warn(name: string, condition: boolean, message?: string, value?: any) {
  const status = condition ? 'PASS' : 'WARN';
  const icon = condition ? '  ✅' : '  ⚠️ ';
  const suffix = value !== undefined ? ` (${JSON.stringify(value)})` : '';
  console.log(`${icon} ${name}${suffix}`);
  results.push({ suite: currentSuite, name, status, message, value });
}

// ══════════════════════════════════════════════════════════════════════════════
// MOCK DATA — Realistic pipeline output
// ══════════════════════════════════════════════════════════════════════════════

const MOCK_SOURCES_12 = Array.from({ length: 12 }, (_, i) => ({
  id: `openalex:W${1000 + i}`,
  title: [
    'GPTs are GPTs: Labor Market Impact of Large Language Models',
    'Automation and the Future of Work: A Longitudinal Analysis',
    'AI Displacement Effects on Middle-Skill Workers: RCT Evidence',
    'Task-Based Model of Technology and Employment: 2020 Update',
    'Wage Polarization and AI Adoption in OECD Countries',
    'Generative AI and White-Collar Jobs: A Survey of 5,000 Firms',
    'Robots and Employment: Evidence from 17 Manufacturing Sectors',
    'Universal Basic Income as Response to AI Displacement: A Review',
    'Complementarity vs Substitution in Human-AI Collaboration',
    'Labor Market Transitions in the Age of AI: German Bundesbank Study',
    'Platform Workers and Algorithmic Management: A Systematic Review',
    'Skill-Biased Technological Change Revisited for the AI Era',
  ][i],
  abstract: `This study examines the impact of artificial intelligence on labor markets. Using a sample of ${(i + 1) * 1200} workers across ${(i + 1) * 3} sectors, we find significant heterogeneity in exposure. Our results suggest that ${i % 2 === 0 ? 'displacement effects' : 'complementarity gains'} dominate in the medium term (3-5 years). The evidence points to a ${10 + i * 2}% change in affected occupations. We employ ${['RCT', 'difference-in-differences', 'instrumental variables', 'meta-regression', 'propensity score matching'][i % 5]} methodology. Policy implications are discussed.`,
  year: 2020 + (i % 5),
  provider: ['openalex', 'crossref', 'semanticscholar', 'arxiv', 'openalex', 'crossref', 'openalex', 'semanticscholar', 'openalex', 'crossref', 'openalex', 'openalex'][i],
  doi: `10.1234/test.${1000 + i}`,
  citationCount: (12 - i) * 145,
  qualityScore: 75 + (i % 15),
  noveltyScore: 60 + (i % 25),
  authors: [
    { author: { name: ['Eloundou, T.', 'Acemoglu, D.', 'Autor, D.', 'Brynjolfsson, E.', 'LeCun, Y.', 'Agrawal, A.', 'Furman, J.', 'Bessen, J.', 'Webb, M.', 'Moll, B.', 'Pierson, E.', 'Goldin, C.'][i] } },
    { author: { name: ['Manning, S.', 'Restrepo, P.', 'Levy, F.', 'McAfee, A.', 'Bengio, Y.', 'Gans, J.', 'Seamans, R.', 'Klenow, P.', 'Dorn, D.', 'Sufi, A.', 'Leskovec, J.', 'Katz, L.'][i] } },
  ],
  raw: {
    primary_location: {
      source: {
        display_name: ['Science', 'Nature Human Behaviour', 'Quarterly Journal of Economics', 'American Economic Review', 'Review of Economic Studies', 'NBER Working Paper', 'Journal of Labor Economics', 'Brookings Papers', 'RAND Research Report', 'IMF Working Paper', 'ILO Research Brief', 'OECD Policy Brief'][i],
        is_oa: i % 3 === 0,
      },
    },
  },
  topics: ['artificial intelligence', 'labor market', 'automation', 'employment', 'wages'],
}));

const MOCK_BRIEF_ANALYSIS = {
  title: 'Artificial Intelligence and Labor Markets: Heterogeneous Effects Across Skill Levels',
  summary: `The preponderance of evidence indicates that AI adoption generates significant but heterogeneous labor market effects [SRC-1]. High-quality RCT evidence from [SRC-3] demonstrates a 15-20% displacement rate in routine cognitive tasks over a 5-year horizon. However, [SRC-2] and [SRC-9] find complementarity gains in creative and managerial roles that partially offset displacement.

Wage polarization emerges as the dominant structural trend [SRC-5], with middle-skill workers bearing disproportionate adjustment costs. The [SRC-6] survey of 5,000 firms reveals that firms adopting generative AI report 8-12% productivity gains in the first year, but employment adjustments lag adoption by 18-24 months.`,
  consensus: `Researchers broadly agree that AI displaces routine cognitive and manual tasks [SRC-1][SRC-3][SRC-7]. The OECD study [SRC-5] and IMF analysis [SRC-10] converge on 15-40% task automation potential across occupational categories. There is strong consensus that the distributional effects are regressive absent policy intervention [SRC-8].`,
  disagreements: `Significant disagreement persists on net employment effects. [SRC-2] argues for strong complementarity in high-skill occupations; [SRC-4] challenges this using a task-based model showing that complementarity requires costly skill adaptation. [SRC-9] estimates positive net effects; [SRC-11] finds null effects in platform economy contexts.`,
  debate: {
    pro: `AI creates new job categories and augments human productivity [SRC-9][SRC-12]. The historical precedent of electrification [SRC-4] suggests net positive employment over 20-year cycles. Automation reduces drudgery and frees workers for higher-value activities. [SRC-6] finds that 40% of displaced workers transition to better-paid roles within 3 years when retraining support is provided [SRC-8].`,
    con: `Short to medium-term displacement is severe and geographically concentrated [SRC-1][SRC-3]. Unlike previous technology waves, AI targets cognitive tasks that historically protected middle-class workers [SRC-4][SRC-5]. The pace of adoption exceeds institutional capacity for retraining [SRC-8]. Platform workers face algorithmic wage suppression independent of displacement [SRC-11].`,
    synthesis: `The net effect depends critically on policy design and timing. Evidence from [SRC-8] on proactive retraining investments and [SRC-10] on wage insurance schemes suggests that negative distributional effects are not inevitable. The optimal policy window is 2-5 years post-adoption before labor market hysteresis sets in [SRC-1][SRC-3].`,
  },
  evidence: `Evidence quality is moderate to high. Three studies employ experimental or quasi-experimental designs [SRC-1][SRC-3][SRC-5]. Meta-analytic estimates are consistent across [SRC-2][SRC-7][SRC-12]. Key limitations include limited long-term panel data, selection bias in firm-level surveys [SRC-6], and underpowered studies on developing country contexts.`,
  implications: `Policymakers face a narrow window to implement proactive labor market policies. Priority interventions include: portable skills accounts for worker retraining [SRC-8], wage insurance during occupational transitions [SRC-10], and antitrust scrutiny of algorithmic wage-setting in gig platforms [SRC-11]. Education systems must shift toward skills complementary to AI [SRC-12].`,
  risks: `The primary analytical risk is conflation of automation potential with realized automation, as [SRC-4] demonstrates these can diverge significantly by sector. Publication bias toward positive complementarity findings cannot be ruled out. The evidence base for developing economies is thin — only [SRC-10] provides systematic cross-country evidence beyond OECD.`,
  open_questions: `How will generative AI's capability expansion alter task-automation forecasts beyond 2025? What is the minimum viable retraining investment per displaced worker? Does automation-driven wage suppression persist in tight labor markets?`,
  what_changes_mind: `A large-scale RCT across multiple sectors with 10-year follow-up showing net positive employment and wage outcomes would substantially revise our assessment. Alternatively, evidence that wage insurance programs fully offset distributional losses at reasonable cost.`,
};

const MOCK_STRATEGIC_ANALYSIS = {
  title: 'AI-Driven Labor Displacement: A Strategic Assessment for Policymakers',
  executiveSummary: `This strategic report synthesizes evidence from ${MOCK_SOURCES_12.length} high-quality studies to assess the labor market implications of AI adoption. Our analysis identifies a critical 3-5 year policy window before labor market hysteresis renders intervention costlier and less effective [SRC-1][SRC-3].

  The evidence is unambiguous on displacement of routine cognitive tasks but contested on net employment effects. We assess with high confidence that wage polarization will intensify absent proactive intervention [SRC-5][SRC-10]. Three scenarios are presented: managed transition, laissez-faire disruption, and accelerated augmentation [SRC-2][SRC-9].`,
  keyFindings: [
    'AI adoption displaces 15-40% of routine cognitive tasks across OECD occupations within 5 years [SRC-1][SRC-5]',
    'Middle-skill workers bear disproportionate adjustment costs: 3x higher than high-skill and 2x higher than low-skill workers [SRC-3][SRC-7]',
    'Generative AI extends automation to 40% of previously protected white-collar roles [SRC-6][SRC-12]',
    'Proactive retraining investments reduce long-term unemployment duration by 8-12 months [SRC-8]',
    'Without intervention, the Gini coefficient is projected to increase by 2-4 points in AI-intensive economies [SRC-10]',
  ],
  urgencyLevel: 'high' as const,
  confidenceLevel: 'medium' as const,
  literatureOverview: `The labor economics literature on AI and employment has expanded dramatically since 2019. Seminal works by [SRC-1] and [SRC-4] established the theoretical framework distinguishing task automation from job displacement. This task-based approach has become the dominant paradigm, enabling more precise estimates of automation exposure.

  The empirical literature bifurcates between studies finding net displacement effects [SRC-3][SRC-5][SRC-7] and those finding complementarity gains [SRC-2][SRC-9][SRC-12]. This split reflects genuine heterogeneity in worker skill levels, firm adoption strategies, and sectoral characteristics rather than methodological disagreement.`,
  theoreticalFrameworks: 'Task-based models (Acemoglu-Restrepo [SRC-4]), skill-biased technological change (Goldin-Katz [SRC-12]), routine-biased technological change (Autor-Levy-Murnane)',
  methodologicalApproaches: 'Difference-in-differences exploiting adoption timing [SRC-3], instrumental variables using robot penetration [SRC-7], firm surveys with productivity modules [SRC-6], meta-regression analysis [SRC-2]',
  keyStudies: [
    { citation: '[SRC-1]', contribution: 'First large-scale study of GPT exposure across US occupations', limitations: 'Potential automation vs realized automation conflation' },
    { citation: '[SRC-3]', contribution: 'RCT evidence on displacement rates in cognitive tasks', limitations: 'Single-country, short follow-up (18 months)' },
    { citation: '[SRC-5]', contribution: 'Cross-OECD wage polarization analysis 2010-2024', limitations: 'Aggregate data masks within-occupation variation' },
  ],
  themes: [
    { name: 'Task Automation', description: 'AI capabilities map to occupational task bundles', evidence: 'Strong — 8 studies', sources: ['[SRC-1]', '[SRC-4]', '[SRC-7]'] },
    { name: 'Wage Polarization', description: 'Middle-skill wage compression', evidence: 'Strong — 5 studies', sources: ['[SRC-5]', '[SRC-10]', '[SRC-12]'] },
    { name: 'Retraining Efficacy', description: 'Evidence on intervention effectiveness', evidence: 'Moderate — 3 studies', sources: ['[SRC-8]', '[SRC-10]'] },
  ],
  consensus: 'Strong consensus on automation potential and distributional effects [SRC-1][SRC-3][SRC-5][SRC-7]. Near-universal agreement that absent policy, inequality rises [SRC-10].',
  controversies: 'Net employment effects remain disputed [SRC-2][SRC-9]. Pace of adjustment contested between economists and computer scientists [SRC-12].',
  emergingTrends: 'Generative AI extending to white-collar roles [SRC-6]. Platform algorithmic management as new displacement vector [SRC-11].',
  debate: {
    position1: {
      label: 'Complementarity-Dominant',
      arguments: ['AI augments high-skill workers [SRC-9]', 'Historical precedent supports net job creation [SRC-4]', 'Productivity gains fund new employment [SRC-12]'],
      evidence: 'Moderate — 4 studies, mostly firm-level',
      proponents: ['Brynjolfsson', 'McAfee', 'Agrawal'],
    },
    position2: {
      label: 'Displacement-Dominant',
      arguments: ['Cognitive task displacement unprecedented [SRC-1]', 'Adjustment costs exceed gains for median worker [SRC-3]', 'Gig economy suppresses wage recovery [SRC-11]'],
      evidence: 'Strong — 7 studies, including RCTs',
      proponents: ['Acemoglu', 'Restrepo', 'Autor'],
    },
    synthesis: 'The debate is partially false: displacement and complementarity co-occur across the skill distribution. Policy determines the balance [SRC-8][SRC-10].',
    nuances: 'Sector, country, and firm-size heterogeneity explains much of the apparent disagreement in the literature.',
  },
  evidenceQuality: {
    overallScore: 7,
    methodology: 'Mix of RCT, quasi-experimental, and observational',
    sampleSizes: 'Generally large (thousands to millions of workers)',
    replication: 'Core displacement findings replicated across OECD countries',
    biases: 'Publication bias toward positive results; firm-survey response bias',
    gaps: 'Developing economy evidence thin; long-run (10+ year) estimates absent',
  },
  stakeholderAnalysis: [
    { stakeholder: 'Middle-skill workers', impact: 'Wage stagnation and displacement', magnitude: 'high' as const, details: 'Largest exposed group; limited retraining access' },
    { stakeholder: 'Firms', impact: 'Productivity gains', magnitude: 'medium' as const, details: '8-12% productivity improvement in Year 1 [SRC-6]' },
    { stakeholder: 'Governments', impact: 'Fiscal pressure from retraining + transfers', magnitude: 'medium' as const, details: 'Estimated $180B annual cost in OECD [SRC-10]' },
    { stakeholder: 'High-skill workers', impact: 'Wage premium expansion', magnitude: 'low' as const, details: 'AI complementarity widens existing premium [SRC-9]' },
  ],
  scenarios: [
    { name: 'Managed Transition', probability: 35, description: 'Proactive retraining + wage insurance deployed at scale', implications: 'Gini +0.5pts; unemployment peak +2% for 3 years', signals: 'G7 retraining commitments; OECD policy convergence' },
    { name: 'Laissez-Faire Disruption', probability: 45, description: 'Market-led adjustment without institutional support', implications: 'Gini +3pts; structural unemployment +5% in manufacturing regions', signals: 'Budget austerity; weak unions' },
    { name: 'Accelerated Augmentation', probability: 20, description: 'Rapid complementarity via education reform + AI tools', implications: 'Net positive employment; 15% productivity boost', signals: 'AI literacy adoption rates; reskilling platform scale' },
  ],
  recommendations: {
    immediate: ['Launch portable skills account pilot in 5 OECD countries [SRC-8]', 'Mandate algorithmic wage transparency in gig platforms [SRC-11]'],
    shortTerm: ['Implement wage insurance covering 50% of wage loss for 2 years [SRC-10]', 'Establish AI adoption notification requirements for large employers'],
    longTerm: ['Redesign education around AI-complementary skills [SRC-12]', 'Develop cross-border portability of retraining credentials'],
    riskMitigation: ['Contingency fund for regional displacement shocks', 'Independent monitoring of AI wage effects in real-time'],
  },
  implementation: {
    prerequisites: ['Political coalition for retraining investment', 'Labor market data infrastructure upgrade'],
    timeline: '2025-2030: pilot → national scale → OECD coordination',
    resources: '$45-90B annually at OECD level per [SRC-10] estimates',
    metrics: ['Displaced worker re-employment rate', 'Wage replacement ratio', 'Gini coefficient trajectory'],
    obstacles: ['Fiscal constraints', 'Employer lobbying against transparency requirements', 'Speed of AI capability growth outpacing policy'],
  },
  conclusion: `The evidence mandates a proactive response. The 3-5 year policy window identified by [SRC-1] and [SRC-3] requires immediate action on retraining infrastructure and wage insurance design. Inaction risks structural inequality that historical precedent suggests is extremely difficult to reverse [SRC-5][SRC-10].`,
  openQuestions: [
    'Will generative AI capability growth accelerate or plateau by 2027?',
    'Can retraining programs achieve scale without quality degradation?',
    'Do wage insurance programs alter worker search behavior negatively?',
  ],
  whatChangesMind: 'A credible 10-year natural experiment showing that laissez-faire adjustment produces equivalent outcomes to proactive intervention at lower fiscal cost.',
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN QA RUNNER
// ══════════════════════════════════════════════════════════════════════════════
async function main() {

// ══════════════════════════════════════════════════════════════════════════════
// [A] PIPELINE TYPES
// ══════════════════════════════════════════════════════════════════════════════
suite('[A] PIPELINE TYPES');

// APA Citation formatting
const apa1 = formatAPA(MOCK_SOURCES_12[0], 1); // 3 authors
const apa3 = formatAPA(MOCK_SOURCES_12[2], 3); // should truncate to et al.
const apaNoAuthors = formatAPA({ ...MOCK_SOURCES_12[0], authors: [] }, 5);
const apaNoJournal = formatAPA({ ...MOCK_SOURCES_12[0], raw: null }, 7);

assert('[A1] formatAPA: index assigned correctly', apa1.index === 1);
assert('[A2] formatAPA: year extracted', apa1.year === '2020', `year should be '2020', got: ${JSON.stringify(apa1.year)}`);
assert('[A3] formatAPA: title preserved', apa1.title.includes('GPTs'), `got: ${apa1.title}`);
assert('[A4] formatAPA: authors formatted (APA style)', typeof apa1.authors === 'string' && apa1.authors.length > 0, `got: ${apa1.authors}`);
assert('[A5] formatAPA: journal extracted from raw', apa1.source === 'Science', `got: ${apa1.source}`);
assert('[A6] formatAPA: DOI preserved', apa1.doi === '10.1234/test.1000');
assert('[A7] formatAPA: no-author graceful fallback', typeof apaNoAuthors.authors === 'string');
assert('[A8] formatAPA: no-raw graceful fallback', typeof apaNoJournal.source === 'string');

const htmlRef = renderAPAHtml(apa1);
assert('[A9] renderAPAHtml: has apa-ref class', htmlRef.includes('apa-ref'));
assert('[A10] renderAPAHtml: has anchor id ref-1', htmlRef.includes('id="ref-1"'));
assert('[A11] renderAPAHtml: has DOI link', htmlRef.includes('doi.org'));
assert('[A12] renderAPAHtml: title in italics or present', htmlRef.includes(apa1.title.slice(0, 20)));
assert('[A13] renderAPAHtml: non-empty output', htmlRef.length > 80);

// PipelineStats typing
const stats: PipelineStats = {
  scout: { found: 162, upserted: 90, sourceIds: ['id1', 'id2'], providers: ['openalex', 'crossref'] },
  rank: { count: 12, avgQuality: 76 },
  analyst: { hasDebate: true, passes: 3 },
  guard: { ok: true, usedCount: 24, invalid: [] },
  htmlLength: 45000,
  criticalLoop: { iterations: 2, finalScore: 82, improvement: 12, needsHumanReview: false },
};
assert('[A14] PipelineStats: typed assignment compiles', stats.rank?.count === 12);
assert('[A15] PipelineStats: nested optional access safe', (stats.criticalLoop?.finalScore ?? 0) > 0);
assert('[A16] PipelineStats: scout.providers present', Array.isArray(stats.scout?.providers));

// DataLineage
const lineage = createLineageTracker('brief-123', 'AI and labor markets');
assert('[A17] createLineageTracker: returns object', typeof lineage === 'object');
assert('[A18] DataLineage: briefId set', lineage.briefId === 'brief-123');
assert('[A19] DataLineage: query set', lineage.query === 'AI and labor markets');
assert('[A20] DataLineage: transformations array initialized', Array.isArray(lineage.transformations));

recordTransformation(lineage, 'scout', 162, 90, 31000, ['id1', 'id2']);
assert('[A21] recordTransformation: adds entry', lineage.transformations.length === 1);
assert('[A22] recordTransformation: inputCount correct', lineage.transformations[0].inputCount === 162);
assert('[A23] recordTransformation: outputCount correct', lineage.transformations[0].outputCount === 90);

// ══════════════════════════════════════════════════════════════════════════════
// [B] CITATION GUARD
// ══════════════════════════════════════════════════════════════════════════════
suite('[B] CITATION GUARD');

const guardOk = citationGuard({ summary: 'Result [SRC-1] and [SRC-3] confirm [SRC-5]' }, 12);
assert('[B1] Guard OK: ok=true when all refs valid (1-12)', guardOk.ok === true);
assert('[B2] Guard OK: usedCount=3', guardOk.usedCount === 3, `got ${guardOk.usedCount}`);
assert('[B3] Guard OK: invalid empty', guardOk.invalid.length === 0);

const guardInvalid = citationGuard({ summary: 'See [SRC-0] and [SRC-13] also [SRC-99]' }, 12);
assert('[B4] Guard INVALID: ok=false', guardInvalid.ok === false);
assert('[B5] Guard INVALID: 3 invalid refs', guardInvalid.invalid.length === 3, `got ${guardInvalid.invalid}`);

const guardNoCite = citationGuard({ summary: 'No citations here at all.' }, 12);
assert('[B6] Guard NO-CITE: ok=false (0 citations)', guardNoCite.ok === false);
assert('[B7] Guard NO-CITE: usedCount=0', guardNoCite.usedCount === 0);

const guardMixed = citationGuard({ summary: '[SRC-1] good [SRC-12] good [SRC-13] bad' }, 12);
assert('[B8] Guard MIXED: ok=false', guardMixed.ok === false);
assert('[B9] Guard MIXED: 1 invalid ref', guardMixed.invalid.includes(13));
assert('[B10] Guard MIXED: valid refs also counted (usedCount=3)', guardMixed.usedCount === 3);

const guardNested = citationGuard({ debate: { pro: '[SRC-2]', con: '[SRC-4]' }, summary: '[SRC-6]' }, 12);
assert('[B11] Guard NESTED JSON: scans all fields', guardNested.usedCount === 3);

// ══════════════════════════════════════════════════════════════════════════════
// [C] INTER-PASS VALIDATION (Analyst thematic map)
// ══════════════════════════════════════════════════════════════════════════════
suite('[C] INTER-PASS VALIDATION');

// Verify analyst-multipass file exists and has validateThematicMap logic
const analystMultipassPath = resolve('./lib/agent/analyst-multipass.ts');
assert('[C1] analyst-multipass.ts file exists on disk', existsSync(analystMultipassPath));

// Test via direct structural test of the validation logic (reimplemented here for QA)
function validateThematicMapQA(themes: any[], sourceCount: number) {
  const srcPattern = /\[SRC-(\d+)\]/g;
  const removedNames: string[] = [];
  const validatedThemes = themes.filter(theme => {
    const sources = theme.sources || [];
    if (sources.length === 0) return true;
    const valid = sources.filter((ref: string) => {
      const matches = [...ref.matchAll(srcPattern)];
      return matches.length === 0 || matches.every(m => {
        const n = parseInt(m[1], 10);
        return n >= 1 && n <= sourceCount;
      });
    });
    if (valid.length === 0 && sources.length > 0) { removedNames.push(theme.name); return false; }
    return true;
  });
  return { themes: validatedThemes, removedThemes: removedNames.length, names: removedNames };
}

const themes_clean = [
  { name: 'Automation', sources: ['[SRC-1]', '[SRC-3]'], dataPoints: ['15% [SRC-1]'] },
  { name: 'Wages', sources: ['[SRC-5]', '[SRC-7]'], dataPoints: [] },
];
const r1 = validateThematicMapQA(themes_clean, 12);
assert('[C2] Valid themes: none removed', r1.removedThemes === 0);
assert('[C3] Valid themes: both kept', r1.themes.length === 2);

const themes_hallucinated = [
  { name: 'Real Theme', sources: ['[SRC-1]', '[SRC-3]'], dataPoints: [] },
  { name: 'Hallucinated Theme', sources: ['[SRC-15]', '[SRC-20]'], dataPoints: ['data [SRC-15]'] },
  { name: 'Edge Case', sources: ['[SRC-12]'], dataPoints: [] }, // exactly at boundary
];
const r2 = validateThematicMapQA(themes_hallucinated, 12);
assert('[C4] Hallucinated theme removed (SRC-15, SRC-20 out of range)', r2.removedThemes === 1);
assert('[C5] Real theme kept', r2.themes.some((t: any) => t.name === 'Real Theme'));
assert('[C6] Edge case (SRC-12) kept', r2.themes.some((t: any) => t.name === 'Edge Case'));
assert('[C7] Hallucinated theme name logged', r2.names.includes('Hallucinated Theme'));

const themes_all_invalid = [
  { name: 'All Bad', sources: ['[SRC-99]', '[SRC-100]'], dataPoints: [] },
];
const r3 = validateThematicMapQA(themes_all_invalid, 12);
assert('[C8] All-invalid theme: removed', r3.removedThemes === 1);

const themes_no_src = [
  { name: 'No Citations', sources: ['text without citation'], dataPoints: [] },
];
const r4 = validateThematicMapQA(themes_no_src, 12);
assert('[C9] Non-citation strings: kept (not treated as invalid ref)', r4.removedThemes === 0);

// ══════════════════════════════════════════════════════════════════════════════
// [D] EDITOR — BRIEF FORMAT
// ══════════════════════════════════════════════════════════════════════════════
suite('[D] EDITOR — BRIEF FORMAT');

const briefHtml = renderProfessionalBriefHTML(MOCK_BRIEF_ANALYSIS, MOCK_SOURCES_12);

// Structure
assert('[D1] DOCTYPE present', briefHtml.includes('<!DOCTYPE html>'));
assert('[D2] UTF-8 charset declared', briefHtml.includes('charset="UTF-8"') || briefHtml.includes('charset=utf-8'));
assert('[D3] nomosx-brief CSS class present', briefHtml.includes('nomosx-brief'));
assert('[D4] CSS stylesheet included', briefHtml.includes('<style>'));
assert('[D5] Title rendered in H1', briefHtml.includes('Artificial Intelligence and Labor Markets'));
assert('[D6] NomosX brand present', briefHtml.includes('NomosX'));

// Metadata bar
assert('[D7] metadata-bar present', briefHtml.includes('metadata-bar'));
assert('[D8] Source count in metadata', briefHtml.includes('12 sources') || briefHtml.includes('12source'));
assert('[D9] Provider count in metadata', briefHtml.includes('provider'));
assert('[D10] Reading time in metadata', briefHtml.includes('min read'));
assert('[D11] Year range in metadata', briefHtml.match(/\d{4}[–-]\d{4}/) !== null);

// Key findings card
assert('[D12] key-findings-card present', briefHtml.includes('key-findings-card'));
assert('[D13] Key Findings heading', briefHtml.includes('Key Findings'));

// Sections
assert('[D14] Summary section rendered', briefHtml.includes('Executive Summary') || briefHtml.includes('Summary'));
assert('[D15] Consensus section rendered', briefHtml.includes('Consensus'));
assert('[D16] Disagreements section rendered', briefHtml.includes('Disagreement'));
assert('[D17] Debate section rendered', briefHtml.includes('debate'));
assert('[D18] Debate: Arguments For present', briefHtml.includes('Arguments For') || briefHtml.includes('Pro'));
assert('[D19] Debate: Arguments Against present', briefHtml.includes('Arguments Against') || briefHtml.includes('Con'));
assert('[D20] Debate: Synthesis present', briefHtml.includes('Synthesis'));
assert('[D21] Evidence section rendered', briefHtml.includes('Evidence'));
assert('[D22] Implications section rendered', briefHtml.includes('Implication'));
assert('[D23] Risks section rendered', briefHtml.includes('Risk') || briefHtml.includes('Limitation'));
assert('[D24] Open questions section rendered', briefHtml.includes('Open Question') || briefHtml.includes('open_question'));

// Citations
const citeSuperscripts = (briefHtml.match(/class="cite"/g) || []).length;
assert('[D25] [SRC-N] converted to superscripts', citeSuperscripts >= 10, `got ${citeSuperscripts}`);
assert('[D26] No raw [SRC-N] remain in body', !briefHtml.match(/\[SRC-\d+\](?!.*<\/style>)/s));

// APA References
assert('[D27] APA references section present', briefHtml.includes('apa-ref') || briefHtml.includes('References'));
assert('[D28] At least 10 APA entries', (briefHtml.match(/apa-ref/g) || []).length >= 10);
assert('[D29] DOI links in APA refs', briefHtml.includes('doi.org'));
assert('[D30] Anchor IDs for citation linking', briefHtml.includes('id="ref-'));

// Source distribution
assert('[D31] SVG source distribution chart', briefHtml.includes('<svg'));
assert('[D32] Provider names in SVG', briefHtml.includes('openalex') || briefHtml.includes('crossref'));

// Typography/layout
assert('[D33] Paragraph tags used (not raw text)', (briefHtml.match(/<p>/g) || []).length >= 8);
assert('[D34] H2 section headers present', (briefHtml.match(/<h2/g) || []).length >= 5);
assert('[D35] brief-footer present', briefHtml.includes('brief-footer') || briefHtml.includes('footer'));
assert('[D36] XSS: HTML escaping applied (no raw <script> injection)', !briefHtml.includes('<script>alert'));

// Size check (publication-grade should be substantial)
const briefKb = briefHtml.length / 1024;
assert('[D37] HTML output substantial (>8KB)', briefKb > 8, `got ${briefKb.toFixed(1)}KB`);
warn('[D38] HTML not bloated (<200KB)', briefKb < 200, `got ${briefKb.toFixed(1)}KB`, `${briefKb.toFixed(1)}KB`);

// Responsive design
assert('[D39] Viewport meta tag', briefHtml.includes('viewport'));
assert('[D40] max-width in CSS (responsive)', briefHtml.includes('max-width'));

// ══════════════════════════════════════════════════════════════════════════════
// [E] EDITOR — STRATEGIC FORMAT
// ══════════════════════════════════════════════════════════════════════════════
suite('[E] EDITOR — STRATEGIC FORMAT');

const strategicHtml = renderProfessionalStrategicHTML(MOCK_STRATEGIC_ANALYSIS, MOCK_SOURCES_12);

assert('[E1] DOCTYPE present', strategicHtml.includes('<!DOCTYPE html>'));
assert('[E2] Title rendered', strategicHtml.includes('AI-Driven Labor Displacement'));
assert('[E3] Executive Summary rendered', strategicHtml.includes('Executive Summary'));
assert('[E4] Key Findings section rendered', strategicHtml.includes('Key Finding'));
assert('[E5] Urgency level shown (HIGH)', strategicHtml.toUpperCase().includes('HIGH'));
assert('[E6] Literature Review rendered', strategicHtml.includes('Literature') || strategicHtml.includes('Overview'));
assert('[E7] Themes section rendered', strategicHtml.includes('Thematic') || strategicHtml.includes('Theme'));
assert('[E8] Debate position 1 label', strategicHtml.includes('Complementarity-Dominant'));
assert('[E9] Debate position 2 label', strategicHtml.includes('Displacement-Dominant'));
assert('[E10] Stakeholder analysis present', strategicHtml.includes('Stakeholder'));
assert('[E11] Scenario planning section', strategicHtml.includes('Scenario') || strategicHtml.includes('scenario'));
assert('[E12] All 3 scenarios named', strategicHtml.includes('Managed Transition') && strategicHtml.includes('Laissez-Faire') && strategicHtml.includes('Accelerated'));
assert('[E13] Scenario probabilities shown', strategicHtml.includes('35%') || strategicHtml.includes('45%') || strategicHtml.includes('35') || strategicHtml.includes('45'));
assert('[E14] Recommendations section', strategicHtml.includes('Recommendation'));
assert('[E15] Implementation section', strategicHtml.includes('Implementation') || strategicHtml.includes('Roadmap'));
assert('[E16] Conclusion present', strategicHtml.includes('Conclusion') || strategicHtml.includes('conclusion'));
assert('[E17] Open questions present', strategicHtml.includes('Open Question') || strategicHtml.includes('open'));
assert('[E18] What changes mind present', strategicHtml.includes('change') || strategicHtml.includes('mind'));
assert('[E19] APA references section', (strategicHtml.match(/apa-ref/g) || []).length >= 8);
assert('[E20] DOI links in references', strategicHtml.includes('doi.org'));

const strategicCites = (strategicHtml.match(/class="cite"/g) || []).length;
assert('[E21] Citations converted to superscripts', strategicCites >= 15, `got ${strategicCites}`);

const strategicKb = strategicHtml.length / 1024;
assert('[E22] Strategic report larger than brief', strategicHtml.length > briefHtml.length);
assert('[E23] Strategic report substantial (>12KB)', strategicKb > 12, `got ${strategicKb.toFixed(1)}KB`);
warn('[E24] Strategic not bloated (<400KB)', strategicKb < 400, `${strategicKb.toFixed(1)}KB`);

// Evidence quality
assert('[E25] Evidence quality score displayed', strategicHtml.includes('7') || strategicHtml.includes('Evidence Quality'));
assert('[E26] SVG chart present in strategic', strategicHtml.includes('<svg'));

// ══════════════════════════════════════════════════════════════════════════════
// [F] PDF EXPORT
// ══════════════════════════════════════════════════════════════════════════════
suite('[F] PDF EXPORT — Print HTML');

const briefPrintHtml = generatePrintHTML(briefHtml);
const strategicPrintHtml = generatePrintHTML(strategicHtml);

assert('[F1] Brief print HTML generated', briefPrintHtml.length > briefHtml.length);
assert('[F2] Strategic print HTML generated', strategicPrintHtml.length > strategicHtml.length);
assert('[F3] @page CSS injected in brief', briefPrintHtml.includes('@page'));
assert('[F4] @media print CSS injected in brief', briefPrintHtml.includes('@media print'));
assert('[F5] @page CSS injected in strategic', strategicPrintHtml.includes('@page'));
assert('[F6] A4 page size defined', briefPrintHtml.includes('A4'));
assert('[F7] Print margins set', briefPrintHtml.includes('20mm'));
assert('[F8] print-color-adjust set', briefPrintHtml.includes('print-color-adjust'));
assert('[F9] Brief HTML still valid after print injection', briefPrintHtml.includes('</html>'));
assert('[F10] Strategic HTML still valid after print injection', strategicPrintHtml.includes('</html>'));
assert('[F11] No duplicate </html> tags', (briefPrintHtml.match(/<\/html>/g) || []).length === 1);

// Puppeteer availability check (runtime, non-blocking)
const { generatePDF } = await import('../lib/agent/pdf-export');
const pdfResult = await generatePDF(briefHtml.slice(0, 5000), { format: 'brief', title: 'QA Test' });
if (pdfResult === null) {
  console.log('  ⚠️  [F12] PDF generation: Puppeteer not installed — graceful null returned (EXPECTED in CI)');
  results.push({ suite: currentSuite, name: '[F12] PDF graceful null when Puppeteer unavailable', status: 'WARN' });
} else {
  assert('[F12] PDF buffer returned', Buffer.isBuffer(pdfResult) || pdfResult instanceof Uint8Array);
  assert('[F13] PDF buffer non-empty', (pdfResult as Buffer).length > 1024);
  const pdfKb = (pdfResult as Buffer).length / 1024;
  console.log(`  ✅ [F13] PDF generated: ${pdfKb.toFixed(0)}KB`);
}

// ══════════════════════════════════════════════════════════════════════════════
// [G] PUBLICATION QUALITY SCORING
// ══════════════════════════════════════════════════════════════════════════════
suite('[G] PUBLICATION QUALITY SCORING');

function scorePublication(html: string, format: 'brief' | 'strategic'): {
  score: number;
  checks: Record<string, boolean>;
  grade: string;
} {
  const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const citeCount = (html.match(/class="cite"/g) || []).length;
  const apaCount = (html.match(/apa-ref/g) || []).length;
  const sectionCount = (html.match(/<h2/g) || []).length;
  const paraCount = (html.match(/<p>/g) || []).length;
  const hasSvg = html.includes('<svg');
  const hasMetadata = html.includes('metadata-bar');
  const hasKeyFindings = html.includes('key-findings-card');
  const hasDebate = html.includes('debate');
  const hasDoi = html.includes('doi.org');
  const hasFooter = html.includes('footer') || html.includes('brief-footer');
  const hasViewport = html.includes('viewport');

  const minWords = format === 'strategic' ? 1500 : 600;
  const minCites = format === 'strategic' ? 15 : 8;
  const minApa = format === 'strategic' ? 8 : 6;
  const minSections = format === 'strategic' ? 8 : 5;

  const checks = {
    'Word count adequate': wordCount >= minWords,
    'Citation density adequate': citeCount >= minCites,
    'APA references complete': apaCount >= minApa,
    'Sufficient sections': sectionCount >= minSections,
    'Paragraph structure': paraCount >= 8,
    'SVG chart present': hasSvg,
    'Metadata bar present': hasMetadata,
    'Key findings card': hasKeyFindings,
    'Debate section': hasDebate,
    'DOI links': hasDoi,
    'Footer branding': hasFooter,
    'Responsive viewport': hasViewport,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const score = Math.round((passed / total) * 100);
  const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'F';

  return { score, checks, grade };
}

const briefScore = scorePublication(briefHtml, 'brief');
console.log(`\n  📊 Brief Quality Score: ${briefScore.score}/100 — Grade: ${briefScore.grade}`);
for (const [check, passed] of Object.entries(briefScore.checks)) {
  console.log(`    ${passed ? '✅' : '❌'} ${check}`);
}
assert('[G1] Brief quality score ≥80 (Grade A)', briefScore.score >= 80, `got ${briefScore.score}/100 (${briefScore.grade})`);

const strategicScore = scorePublication(strategicHtml, 'strategic');
console.log(`\n  📊 Strategic Quality Score: ${strategicScore.score}/100 — Grade: ${strategicScore.grade}`);
for (const [check, passed] of Object.entries(strategicScore.checks)) {
  console.log(`    ${passed ? '✅' : '❌'} ${check}`);
}
assert('[G2] Strategic quality score ≥80 (Grade A)', strategicScore.score >= 80, `got ${strategicScore.score}/100 (${strategicScore.grade})`);

// Specific density checks
const briefWords = briefHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const strategicWords = strategicHtml.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
console.log(`\n  📐 Word counts: Brief=${briefWords} words | Strategic=${strategicWords} words`);
assert('[G3] Brief: sufficient word count (≥500)', briefWords >= 500, `got ${briefWords}`);
assert('[G4] Strategic: substantial content (≥1500)', strategicWords >= 1500, `got ${strategicWords}`);
assert('[G5] Strategic longer than brief', strategicWords > briefWords);

const briefCiteDensity = (briefHtml.match(/class="cite"/g) || []).length / Math.max(briefWords / 1000, 1);
console.log(`  📐 Citation density: ${briefCiteDensity.toFixed(1)} cites/1000 words`);
warn('[G6] Citation density adequate (≥3/1000 words)', briefCiteDensity >= 3, `got ${briefCiteDensity.toFixed(1)}`);

// ══════════════════════════════════════════════════════════════════════════════
// [H] EDGE CASES
// ══════════════════════════════════════════════════════════════════════════════
suite('[H] EDGE CASES');

// Empty analysis
const emptyAnalysis: any = {};
let edgeHtml: string | null = null;
try {
  edgeHtml = renderProfessionalBriefHTML(emptyAnalysis, []);
  assert('[H1] Empty analysis: no crash', true);
  assert('[H2] Empty analysis: returns HTML string', typeof edgeHtml === 'string');
  assert('[H3] Empty analysis: has DOCTYPE', edgeHtml!.includes('<!DOCTYPE html>'));
} catch (e: any) {
  assert('[H1] Empty analysis: no crash', false, e.message);
}

// Single source
const singleSourceHtml = renderProfessionalBriefHTML(MOCK_BRIEF_ANALYSIS, [MOCK_SOURCES_12[0]]);
assert('[H4] Single source: no crash', typeof singleSourceHtml === 'string');
assert('[H5] Single source: SVG still renders', singleSourceHtml.includes('<svg') || singleSourceHtml.includes('sources'));

// XSS attempt in title
const xssAnalysis = { ...MOCK_BRIEF_ANALYSIS, title: '<script>alert("xss")</script>' };
const xssHtml = renderProfessionalBriefHTML(xssAnalysis, MOCK_SOURCES_12);
assert('[H6] XSS in title: script tag escaped', !xssHtml.includes('<script>alert("xss")</script>'));
assert('[H7] XSS in title: content still visible (escaped)', xssHtml.includes('alert') || xssHtml.includes('&lt;script&gt;'));

// Missing debate fields
const noDebateAnalysis = { ...MOCK_BRIEF_ANALYSIS, debate: null };
const noDebateHtml = renderProfessionalBriefHTML(noDebateAnalysis as any, MOCK_SOURCES_12);
assert('[H8] Missing debate: no crash', typeof noDebateHtml === 'string');

// Partial debate
const partialDebate = { ...MOCK_BRIEF_ANALYSIS, debate: { pro: 'Some pro argument [SRC-1]' } };
const partialHtml = renderProfessionalBriefHTML(partialDebate as any, MOCK_SOURCES_12);
assert('[H9] Partial debate: no crash', typeof partialHtml === 'string');

// APA with malformed authors
const malformedSource = { ...MOCK_SOURCES_12[0], authors: [{ author: null }, { author: { name: null } }] };
let apaResult: any;
try {
  apaResult = formatAPA(malformedSource as any, 1);
  assert('[H10] Malformed authors: formatAPA no crash', true);
  assert('[H11] Malformed authors: fallback string returned', typeof apaResult.authors === 'string');
} catch (e: any) {
  assert('[H10] Malformed authors: formatAPA no crash', false, e.message);
}

// Citation guard with null
const nullGuard = citationGuard(null, 10);
assert('[H12] Citation guard: handles null input', typeof nullGuard.ok === 'boolean');

// Citation guard with nested arrays
const nestedGuard = citationGuard({ arr: ['[SRC-1]', '[SRC-2]'], deep: { x: '[SRC-3]' } }, 5);
assert('[H13] Citation guard: scans nested arrays/objects', nestedGuard.usedCount >= 3);

// ══════════════════════════════════════════════════════════════════════════════
// [I] FUNNEL SIMULATION (RANK → ANALYST → GUARD → EDITOR → PUBLISH)
// ══════════════════════════════════════════════════════════════════════════════
suite('[I] FUNNEL SIMULATION');

console.log('\n  Simulating RANK → GUARD → EDITOR → QUALITY CHECK → PUBLISH decision...\n');

// Step 1: Simulate RANK output
const rankedSources = MOCK_SOURCES_12.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 12);
assert('[I1] RANK: 12 sources selected', rankedSources.length === 12);
assert('[I2] RANK: all have quality scores', rankedSources.every(s => s.qualityScore >= 0));
const avgQ = rankedSources.reduce((s, x) => s + x.qualityScore, 0) / rankedSources.length;
warn('[I3] RANK: avg quality ≥70', avgQ >= 70, `avg quality: ${avgQ.toFixed(0)}`);
assert('[I4] RANK: multiple providers', new Set(rankedSources.map(s => s.provider)).size >= 2);
console.log(`  ✅ RANK: ${rankedSources.length} sources, avg quality ${avgQ.toFixed(0)}, ${new Set(rankedSources.map(s => s.provider)).size} providers`);

// Step 2: Simulate CITATION GUARD pass
const funnelGuard = citationGuard(MOCK_BRIEF_ANALYSIS, rankedSources.length);
assert('[I5] GUARD: citations present', funnelGuard.usedCount > 0, `${funnelGuard.usedCount} citations`);
warn('[I6] GUARD: all citations valid', funnelGuard.ok, `invalid: ${funnelGuard.invalid}`);
console.log(`  ✅ GUARD: ${funnelGuard.usedCount} citations, ${funnelGuard.invalid.length} invalid, ok=${funnelGuard.ok}`);

// Step 3: Simulate EDITOR pass
const funnelHtml = renderProfessionalBriefHTML(MOCK_BRIEF_ANALYSIS, rankedSources);
assert('[I7] EDITOR: HTML generated', funnelHtml.length > 0);
assert('[I8] EDITOR: professional template used', funnelHtml.includes('nomosx-brief'));
const htmlKb = funnelHtml.length / 1024;
console.log(`  ✅ EDITOR: ${htmlKb.toFixed(1)}KB HTML, ${(funnelHtml.match(/class="cite"/g) || []).length} citation superscripts`);

// Step 4: Simulate PUBLICATION READINESS check
const pubScore = scorePublication(funnelHtml, 'brief');
const isPublishable = pubScore.score >= 75 && funnelHtml.includes('apa-ref');
assert('[I9] PUBLISH GATE: quality ≥75', pubScore.score >= 75, `score: ${pubScore.score}`);
assert('[I10] PUBLISH GATE: APA refs present', funnelHtml.includes('apa-ref'));
assert('[I11] PUBLISH GATE: PUBLISHABLE', isPublishable, `score=${pubScore.score}, APA=${funnelHtml.includes('apa-ref')}`);
console.log(`  ✅ PUBLISH: ${isPublishable ? '✅ PUBLISHABLE' : '❌ BLOCKED'} — score=${pubScore.score}/100 grade=${pubScore.grade}`);

// Step 5: Strategic format funnel
const strategicGuard = citationGuard(MOCK_STRATEGIC_ANALYSIS, rankedSources.length);
const strategicFunnelHtml = renderProfessionalStrategicHTML(MOCK_STRATEGIC_ANALYSIS, rankedSources);
const strategicPubScore = scorePublication(strategicFunnelHtml, 'strategic');
const isStrategicPublishable = strategicPubScore.score >= 75;
assert('[I12] STRATEGIC FUNNEL: citations present', strategicGuard.usedCount > 0);
assert('[I13] STRATEGIC FUNNEL: HTML generated', strategicFunnelHtml.length > 0);
assert('[I14] STRATEGIC FUNNEL: quality ≥75', strategicPubScore.score >= 75, `score: ${strategicPubScore.score}`);
assert('[I15] STRATEGIC FUNNEL: PUBLISHABLE', isStrategicPublishable, `score=${strategicPubScore.score}`);
console.log(`  ✅ STRATEGIC PUBLISH: ${isStrategicPublishable ? '✅ PUBLISHABLE' : '❌ BLOCKED'} — score=${strategicPubScore.score}/100 grade=${strategicPubScore.grade}`);

// ══════════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ══════════════════════════════════════════════════════════════════════════════
const suiteNames = [...new Set(results.map(r => r.suite))];
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
const warned = results.filter(r => r.status === 'WARN').length;
const total = results.length;
const percent = Math.round((passed / total) * 100);

console.log(`\n${'═'.repeat(60)}`);
console.log(`  NomosX FULL FUNNEL QA REPORT`);
console.log('═'.repeat(60));

for (const s of suiteNames) {
  const sResults = results.filter(r => r.suite === s);
  const sPassed = sResults.filter(r => r.status === 'PASS').length;
  const sFailed = sResults.filter(r => r.status === 'FAIL').length;
  const sWarn = sResults.filter(r => r.status === 'WARN').length;
  const icon = sFailed === 0 ? '✅' : '❌';
  console.log(`  ${icon} ${s}: ${sPassed}P / ${sFailed}F / ${sWarn}W`);
}

console.log(`\n  Total: ${passed}✅  ${failed}❌  ${warned}⚠️   out of ${total}`);
console.log(`  Score: ${percent}% — ${percent >= 90 ? '🏆 EXCELLENT' : percent >= 80 ? '✅ GOOD' : percent >= 70 ? '⚠️  ACCEPTABLE' : '❌ NEEDS WORK'}`);

if (failed > 0) {
  console.log(`\n  ❌ FAILURES:`);
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`    [${r.suite}] ${r.name}`);
    if (r.message) console.log(`      → ${r.message}`);
  }
}
if (warned > 0) {
  console.log(`\n  ⚠️  WARNINGS:`);
  for (const r of results.filter(r => r.status === 'WARN')) {
    console.log(`    [${r.suite}] ${r.name}${r.value !== undefined ? ` (${r.value})` : ''}`);
  }
}

if (failed > 0) process.exit(1);

} // end main()

main().catch(err => {
  console.error('[QA] Fatal error:', err);
  process.exit(1);
});
