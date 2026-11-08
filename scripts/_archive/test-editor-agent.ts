/**
 * Test: editor-agent + pipeline-types + pdf-export
 */
import { renderProfessionalBriefHTML, renderProfessionalStrategicHTML } from '../lib/agent/editor-agent';
import { formatAPA, renderAPAHtml } from '../lib/agent/pipeline-types';
import { generatePrintHTML } from '../lib/agent/pdf-export';

const pass: string[] = [];
const fail: string[] = [];

function assert(name: string, condition: boolean) {
  if (condition) { pass.push(name); console.log(`  ✅ ${name}`); }
  else { fail.push(name); console.error(`  ❌ FAIL: ${name}`); }
}

// ── Test 1: APA citation formatting ──────────────────────────────────────
console.log('\n=== APA Formatter ===');
const mockSource = {
  title: 'GPTs are GPTs: An Early Look at the Labor Market Impact',
  year: 2023,
  provider: 'openalex',
  authors: [
    { author: { name: 'Tyna Eloundou' } },
    { author: { name: 'Sam Manning' } },
    { author: { name: 'Pamela Mishkin' } },
  ],
  doi: '10.1126/science.adj0998',
  raw: { primary_location: { source: { display_name: 'Science' } } },
};

const apa = formatAPA(mockSource, 1);
assert('formatAPA returns object', typeof apa === 'object');
assert('APA has authors', typeof apa.authors === 'string' && apa.authors.includes('Eloundou'));
assert('APA has year', apa.year === 2023);
assert('APA has title', apa.title.includes('GPTs'));
assert('APA has journal source', apa.source === 'Science');
assert('APA has DOI', apa.doi?.includes('10.1126'));

const apaHtml = renderAPAHtml(apa);
assert('APA HTML has doi.org link', apaHtml.includes('doi.org'));
assert('APA HTML has apa-ref class', apaHtml.includes('apa-ref'));
assert('APA HTML is non-empty', apaHtml.length > 50);

// ── Test 2: Professional Brief HTML ──────────────────────────────────────
console.log('\n=== Professional Brief HTML ===');
const mockAnalysis = {
  title: 'AI and Labor Markets: Evidence Assessment',
  summary: 'Research shows AI impacts labor markets significantly [SRC-1]. Studies confirm automation effects [SRC-2].',
  consensus: 'Most researchers agree on displacement effects [SRC-1][SRC-3].',
  disagreements: 'Disagreement on magnitude [SRC-2] vs [SRC-3].',
  debate: {
    pro: 'AI creates new jobs [SRC-1].',
    con: 'AI displaces workers [SRC-2].',
    synthesis: 'Net effect depends on policy [SRC-3].',
  },
  evidence: 'Strong evidence base [SRC-1][SRC-2][SRC-3].',
  implications: 'Policymakers should invest in retraining [SRC-1].',
  risks: 'Limited long-term data [SRC-2].',
  open_questions: 'More research needed on developing countries.',
  what_changes_mind: 'A large-scale RCT showing no displacement.',
};

const sources = [
  mockSource,
  { ...mockSource, title: 'Second Paper', year: 2024, authors: [{ author: { name: 'John Doe' } }] },
  { ...mockSource, title: 'Third Paper', year: 2025, provider: 'crossref' },
];

const briefHtml = renderProfessionalBriefHTML(mockAnalysis, sources);
assert('Brief HTML: length > 5KB', briefHtml.length > 5000);
assert('Brief HTML: has DOCTYPE', briefHtml.includes('<!DOCTYPE html>'));
assert('Brief HTML: has nomosx-brief class', briefHtml.includes('nomosx-brief'));
assert('Brief HTML: has APA references', briefHtml.includes('apa-ref'));
assert('Brief HTML: has key-findings-card', briefHtml.includes('key-findings-card'));
assert('Brief HTML: has metadata-bar', briefHtml.includes('metadata-bar'));
assert('Brief HTML: has debate section', briefHtml.includes('debate'));
assert('Brief HTML: has SVG chart', briefHtml.includes('<svg'));
assert('Brief HTML: has DOI link', briefHtml.includes('doi.org'));
// Citations converted to superscripts
const citeCount = (briefHtml.match(/class="cite"/g) || []).length;
assert('Brief HTML: [SRC-N] converted to superscripts', citeCount >= 3);

// ── Test 3: Strategic Report HTML ─────────────────────────────────────────
console.log('\n=== Professional Strategic HTML ===');
const mockStrategic = {
  title: 'Strategic Assessment: AI Labor Disruption',
  executiveSummary: 'This report analyzes [SRC-1] and finds [SRC-2] key dynamics.',
  keyFindings: ['AI displaces 15% of tasks [SRC-1]', 'New job creation offsets 60% [SRC-2]'],
  urgencyLevel: 'high' as const,
  confidenceLevel: 'medium' as const,
  literatureOverview: 'The literature spans [SRC-1] through [SRC-3].',
  theoreticalFrameworks: 'Task-based models dominate [SRC-1].',
  methodologicalApproaches: 'Mix of RCT and observational [SRC-2].',
  keyStudies: [{ citation: '[SRC-1]', contribution: 'First large-scale study', limitations: 'US-only' }],
  themes: [{ name: 'Automation', description: 'Core theme', evidence: 'Strong', sources: ['[SRC-1]'] }],
  consensus: 'Disruption is real [SRC-1][SRC-2].',
  controversies: 'Magnitude disputed [SRC-2] vs [SRC-3].',
  emergingTrends: 'GenAI expanding exposure [SRC-1].',
  debate: {
    position1: { label: 'Net positive', arguments: ['Job creation [SRC-1]'], evidence: 'Mixed', proponents: ['Acemoglu'] },
    position2: { label: 'Net negative', arguments: ['Wage suppression [SRC-2]'], evidence: 'Strong', proponents: ['Daron'] },
    synthesis: 'Policy-dependent outcome [SRC-3].',
    nuances: 'Context matters significantly.',
  },
  evidenceQuality: { overallScore: 7, methodology: 'Good', sampleSizes: 'Large', replication: 'Partial', biases: 'Publication bias', gaps: 'Developing world' },
  stakeholderAnalysis: [{ stakeholder: 'Workers', impact: 'Job displacement', magnitude: 'high' as const, details: 'Especially routine tasks' }],
  scenarios: [{ name: 'Rapid Automation', probability: 35, description: 'Fast deployment', implications: 'Mass displacement', signals: 'GPT-4+ adoption' }],
  recommendations: { immediate: ['Invest in retraining'], shortTerm: ['Carbon pricing analog'], longTerm: ['UBI pilot'], riskMitigation: ['Safety nets'] },
  implementation: { prerequisites: ['Political will'], timeline: '2025-2030', resources: '$50B', metrics: ['Employment rate'], obstacles: ['Lobbying'] },
  conclusion: 'Mixed evidence requires adaptive policy [SRC-1].',
  openQuestions: ['Long-run effects?', 'Global South impact?'],
  whatChangesMind: 'A meta-analysis showing net positive employment.',
};

const strategicHtml = renderProfessionalStrategicHTML(mockStrategic, sources);
assert('Strategic HTML: length > 8KB', strategicHtml.length > 8000);
assert('Strategic HTML: has DOCTYPE', strategicHtml.includes('<!DOCTYPE html>'));
assert('Strategic HTML: has key findings', strategicHtml.includes('keyFindings') || strategicHtml.includes('key-findings'));
assert('Strategic HTML: has APA references', strategicHtml.includes('apa-ref'));
assert('Strategic HTML: has SVG', strategicHtml.includes('<svg'));

// ── Test 4: PDF print HTML ────────────────────────────────────────────────
console.log('\n=== PDF Print HTML ===');
const printHtml = generatePrintHTML(briefHtml);
assert('Print HTML: has @page rule', printHtml.includes('@page'));
assert('Print HTML: has @media print', printHtml.includes('@media print'));
assert('Print HTML: longer than input', printHtml.length > briefHtml.length);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════');
console.log(`Score: ${pass.length}/${pass.length + fail.length} passed`);
if (fail.length === 0) {
  console.log('🎯 ALL EDITOR TESTS PASSED');
} else {
  console.error(`❌ ${fail.length} FAILURES: ${fail.join(', ')}`);
  process.exit(1);
}
