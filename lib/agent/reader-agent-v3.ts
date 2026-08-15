/**
 * READER Agent V3 — Full-Text Deep Extraction
 * 
 * Upgrades over V2:
 * 1. PDF FULL-TEXT: Downloads and parses PDFs via pdf-parse (already in deps)
 * 2. CHUNKED READING: Splits long papers into sections, reads each
 * 3. QUANTITATIVE EXTRACTION: Effect sizes, p-values, sample sizes, confidence intervals
 * 4. CROSS-REFERENCE: Identifies which sources cite each other
 * 5. STRUCTURED OUTPUT: Rich ReadingResultV3 with typed quantitative data
 * 6. FALLBACK CHAIN: Full-text → Abstract → Rule-based
 * 
 * A PhD researcher reads the FULL paper. Now so does NomosX.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';
import Sentry from '@sentry/nextjs';
import { AgentRole, assertPermission } from '../governance/index';
import { prisma } from '../db';
import axios from 'axios';
import { RESEARCHER_KBS, type DomainExpertise } from './researcher-kb/index';
import { MULTI_DOMAIN_CORPUS } from '../knowledge/multi-domain-corpus';

// ============================================================================
// TYPES
// ============================================================================

export interface QuantitativeData {
  effectSizes: Array<{
    measure: string;        // "Cohen's d", "OR", "RR", "HR", "β", "r", "η²"
    value: number;
    ci95?: [number, number]; // 95% confidence interval
    pValue?: number;
    context: string;         // What was measured
  }>;
  sampleSizes: Array<{
    n: number;
    population: string;      // Who was studied
    design: string;          // "RCT", "cohort", "cross-sectional", etc.
  }>;
  statisticalTests: string[];  // "t-test", "ANOVA", "regression", etc.
  keyMetrics: Array<{
    name: string;
    value: string;
    unit?: string;
    context: string;
  }>;
}

// LOT 2.4: Mechanism — causal mechanism extracted from source
export interface Mechanism {
  description: string;       // What is the mechanism?
  direction: 'positive' | 'negative' | 'reversing' | 'unclear';  // Effect direction
  rate?: string;             // Rate of change (e.g., "10% per year", "0.5 std")
  horizon: string;           // Time horizon (e.g., "short-term", "5-10 years")
  isStated: boolean;         // true if explicitly stated by authors, false if inferred
  sourceRef?: number;        // Reference to [SRC-N] if available
  statedSpan?: string;       // T5: Verbatim text span from source that supports this mechanism
  spanVerified?: boolean;    // T5: True if statedSpan was verified as a substring of the source text
}

export interface ReadingResultV3 {
  sourceId: string;
  // Core extraction (backward compatible with V2)
  claims: string[];
  methods: string[];
  results: string[];
  limitations: string[];
  confidence: "high" | "medium" | "low";
  // V3 additions
  quantitative: QuantitativeData;
  theoreticalFramework: string;
  researchDesign: string;
  keyContributions: string[];
  futureDirections: string[];
  citedSources: string[];        // DOIs/titles of sources this paper cites (for cross-ref)
  readingDepth: "full_text" | "abstract" | "rule_based";
  wordCount: number;             // How much text was actually read
  sections: string[];            // Which sections were found in the paper
  // LOT 2.4: Causal mechanisms
  mechanisms: Mechanism[];
  extractedText?: string;        // Raw text extracted (for claim grounding)
  // V3.1 additions — heterodox/novelty detection
  claimClassifications?: Array<{
    claim: string;
    type: 'consensus' | 'novel' | 'controversial' | 'replication';
    challengesConsensus: boolean;
    reasoning: string;
  }>;
  originalityAssessment?: {
    level: 'incremental' | 'moderate' | 'paradigm-shifting';
    noveltyScore: number;        // 0-100
    reasoning: string;
  };
  // V3.2: Non-academic source type (intelligence, NGO, think-tank, etc.)
  sourceType?: string;
  error?: string;
}

// ============================================================================
// SOURCE TYPE DETECTION (V3.2 — non-academic source support)
// ============================================================================

/**
 * Detect the type of a source based on its provider and feed metadata.
 * NomosX now collects from 80+ international organizations via RSS feeds,
 * so not every source is an academic paper. This lets the READER adapt its
 * prompt and extraction schema to the actual source type.
 */
const ACADEMIC_PROVIDERS = [
  'openalex', 'crossref', 'arxiv', 'pubmed', 'semantic-scholar',
  'unpaywall', 'doaj', 'core', 'dimensions', 'scopus', 'wos',
  'google-scholar', 'jstor', 'ssrn',
];

const INTELLIGENCE_PROVIDERS = [
  'global-intelligence', 'cia-foia', 'nsa', 'odni', 'nara',
  'dni', 'state-dept', 'dod', 'fbi-foia',
];

const NGO_FEEDS = [
  'amnesty', 'hrw', 'human-rights-watch', 'rsf', 'reporters-without-borders',
  'transparency', 'transparency-international', 'freedom-house', 'osf',
  'open-society', 'doctors-without-borders', 'msf', 'oxfam', 'save-the-children',
  'human-rights-first', 'aclu',
];

const AI_LAB_FEEDS = [
  'openai-research', 'openai', 'deepmind', 'google-research', 'google-ai',
  'msr', 'microsoft-research', 'meta-ai', 'meta-research', 'amazon-science',
  'anthropic', 'ai21', 'cohere',
];

/**
 * Detect the source type. Returns one of:
 * 'academic' | 'intelligence' | 'ngo' | 'think-tank' | 'international-org' |
 * 'science-org' | 'ai-lab' | 'news' | 'default'
 */
function detectSourceType(source: any): string {
  const provider = String(source?.provider || '').toLowerCase();
  const feed = String(source?.raw?.feed || source?.feed || '').toLowerCase();

  // News providers
  if (NEWS_PROVIDERS.includes(provider)) {
    return 'news';
  }

  // Intelligence / security reports
  if (INTELLIGENCE_PROVIDERS.includes(provider)) {
    return 'intelligence';
  }

  // Global think-tanks provider — distinguish NGO vs think-tank by feed
  if (provider === 'global-think-tanks') {
    if (NGO_FEEDS.some(ngo => feed.includes(ngo))) {
      return 'ngo';
    }
    return 'think-tank';
  }

  // International organizations
  if (provider === 'global-orgs' || provider === 'global-organizations') {
    return 'international-org';
  }

  // Global science provider — distinguish AI labs vs science orgs by feed
  if (provider === 'global-science') {
    if (AI_LAB_FEEDS.some(lab => feed.includes(lab))) {
      return 'ai-lab';
    }
    return 'science-org';
  }

  // Academic providers
  if (ACADEMIC_PROVIDERS.includes(provider)) {
    return 'academic';
  }

  // Has a DOI → treat as academic
  if (source?.doi) {
    return 'academic';
  }

  return 'default';
}

// ============================================================================
// ADAPTIVE PROMPT BUILDERS (V3.2)
// ============================================================================

/** Role description per source type */
function buildRoleDescription(sourceType: string): string {
  switch (sourceType) {
    case 'academic':
      return 'You are a PhD-level research analyst performing DEEP EXTRACTION from an academic paper.';
    case 'intelligence':
      return 'You are an intelligence analyst performing DEEP EXTRACTION from an intelligence/security report or declassified document. Extract key findings, threat assessments, methodology (OSINT, HUMINT, SIGINT, etc.), confidence levels, and source reliability.';
    case 'ngo':
      return 'You are a human rights/policy analyst performing DEEP EXTRACTION from an NGO investigation report. Extract documented violations, evidence quality, witness accounts, methodology, and policy recommendations.';
    case 'think-tank':
      return 'You are a policy analyst performing DEEP EXTRACTION from a think-tank policy analysis. Extract policy recommendations, strategic assessments, geopolitical analysis, and evidence base.';
    case 'international-org':
      return 'You are an international policy analyst performing DEEP EXTRACTION from an official international organization report. Extract official positions, statistical findings, policy frameworks, and multilateral recommendations.';
    case 'science-org':
      return 'You are a science analyst performing DEEP EXTRACTION from a research organization publication. Extract scientific findings, experimental results, technological breakthroughs, and research implications.';
    case 'ai-lab':
      return 'You are an AI research analyst performing DEEP EXTRACTION from an AI lab research blog/publication. Extract model capabilities, benchmarks, safety findings, and technical contributions.';
    case 'news':
      return 'You are a news analyst performing DEEP EXTRACTION from a news article. Extract key facts, reported events, sources cited, and potential bias indicators.';
    default:
      return 'You are a research analyst performing DEEP EXTRACTION from a source document.';
  }
}

/** Methods field description per source type */
function buildMethodsDescriptor(sourceType: string): string {
  switch (sourceType) {
    case 'intelligence':
      return 'max 5 intelligence methods (OSINT, HUMINT, SIGINT, IMINT, etc.) and analytical approach';
    case 'ngo':
      return 'max 5 investigation methods (field research, satellite imagery, witness interviews, document analysis, etc.)';
    case 'think-tank':
      return 'max 5 analytical methods (policy analysis, scenario modeling, expert elicitation, etc.)';
    case 'international-org':
      return 'max 5 methods (statistical reporting, policy frameworks, multilateral consultations, etc.)';
    case 'science-org':
      return 'max 5 methods (experimental design, observation, simulation, engineering, etc.)';
    case 'ai-lab':
      return 'max 5 methods (model training, benchmarking, ablation studies, safety evaluation, etc.)';
    case 'news':
      return 'max 5 methods (reporting approach, sourcing, investigative journalism, etc.)';
    case 'academic':
    default:
      return 'max 5 methods — include design type, sample details, analytical approach';
  }
}

/** Results field description per source type */
function buildResultsDescriptor(sourceType: string): string {
  switch (sourceType) {
    case 'intelligence':
      return 'max 5 key findings — include threat assessments, confidence levels, and source reliability if stated';
    case 'ngo':
      return 'max 5 key findings — include documented violations, casualty figures, evidence quality if stated';
    case 'think-tank':
      return 'max 5 key findings — include policy recommendations, strategic assessments, projected impacts if stated';
    case 'international-org':
      return 'max 5 key findings — include official statistics, policy positions, multilateral outcomes if stated';
    case 'science-org':
      return 'max 5 key findings — include experimental results, technological metrics, performance figures if stated';
    case 'ai-lab':
      return 'max 5 key findings — include benchmark scores, model capabilities, safety results if stated';
    case 'news':
      return 'max 5 key facts — include reported events, figures, and statements if stated';
    case 'academic':
    default:
      return 'max 5 key findings — include effect sizes, p-values, confidence intervals if stated';
  }
}

/** researchDesign options per source type */
function buildResearchDesignOptions(sourceType: string): string {
  const academic = 'RCT|quasi-experimental|observational|qualitative|mixed-methods|meta-analysis|theoretical|computational';
  switch (sourceType) {
    case 'intelligence':
      return 'osint-investigation|official-assessment|field-investigation|technical-report|analytical-assessment';
    case 'ngo':
      return 'field-investigation|osint-investigation|statistical-report|official-assessment|technical-report';
    case 'think-tank':
      return 'policy-analysis|scenario-modeling|statistical-report|expert-elicitation|technical-report';
    case 'international-org':
      return 'statistical-report|official-assessment|policy-analysis|technical-report';
    case 'science-org':
      return 'experimental|observational|computational|technical-report|engineering';
    case 'ai-lab':
      return 'computational|experimental|benchmark-evaluation|safety-analysis|technical-report';
    case 'news':
      return 'field-investigation|reporting|osint-investigation|statistical-report';
    case 'academic':
    default:
      return academic;
  }
}

/** quantitative field descriptor per source type */
function buildQuantitativeDescriptor(sourceType: string): string {
  switch (sourceType) {
    case 'intelligence':
      return 'Extract threat statistics, casualty figures, operational metrics, and confidence levels.';
    case 'ngo':
      return 'Extract documented violation counts, casualty figures, displacement numbers, and economic impact figures.';
    case 'think-tank':
      return 'Extract economic projections, policy impact estimates, polling figures, and statistical analyses.';
    case 'international-org':
      return 'Extract official statistics, economic indicators, demographic data, and policy metrics.';
    case 'science-org':
      return 'Extract experimental measurements, performance metrics, and technological specifications.';
    case 'ai-lab':
      return 'Extract benchmark scores, model parameters, training metrics, and performance comparisons.';
    case 'news':
      return 'Extract reported figures, event statistics, and any quantitative claims.';
    case 'academic':
    default:
      return 'For quantitative data, extract EXACT numbers including effect sizes, p-values, and confidence intervals.';
  }
}

// ============================================================================
// PDF EXTRACTION
// ============================================================================

/**
 * Download and parse a PDF, returning raw text.
 * Uses pdf-parse (already in package.json).
 */
async function extractPdfText(url: string, timeout = 15000): Promise<string | null> {
  try {
    // Download PDF
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout,
      maxContentLength: 20 * 1024 * 1024, // 20MB max
      headers: {
        'User-Agent': 'NomosX/3.0 (Academic Research Platform; mailto:contact@nomosx.com)',
      },
    });

    // Use dynamic import for pdf-parse (new API: PDFParse class)
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: Buffer.from(response.data) });
    const data = await parser.getText();
    let numPages = 0;
    try { const info = await parser.getInfo(); numPages = info.total; } catch (err) { console.warn('[Reader V3] PDF getInfo failed:', err); }
    try { await parser.destroy(); } catch (err) { console.warn('[Reader V3] PDF destroy failed:', err); }

    const text = data?.text || '';
    if (text.trim().length < 100) {
      console.log(`[Reader V3] PDF parsed but too short (${text.length} chars)`);
      return null;
    }

    console.log(`[Reader V3] PDF extracted: ${text.length} chars, ${numPages} pages`);
    return text;
  } catch (error: any) {
    console.warn(`[Reader V3] PDF extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * Fetch a news article URL and extract readable text from HTML.
 * Strips scripts, styles, nav, and extracts main content.
 */
async function fetchNewsArticleText(url: string, timeout = 12000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NomosXBot/1.0; +https://nomosx.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      console.warn(`[Reader V3] News fetch HTTP ${res.status} for ${url.slice(0, 80)}`);
      return null;
    }

    const html = await res.text();
    if (html.length < 500) return null;

    // Extract text from common article content patterns
    let text = html;

    // Remove script and style blocks
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
    text = text.replace(/<aside[\s\S]*?<\/aside>/gi, '');

    // Try to extract <article> or <main> content first
    const articleMatch = text.match(/<(?:article|main)[\s\S]*?>([\s\S]*?)<\/(?:article|main)>/i);
    if (articleMatch && articleMatch[1].length > 500) {
      text = articleMatch[1];
    }

    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();

    if (text.length < 200) {
      console.warn(`[Reader V3] News article too short (${text.length} chars) for ${url.slice(0, 80)}`);
      return null;
    }

    // Cap at 8000 chars to stay within LLM context limits
    if (text.length > 8000) text = text.slice(0, 8000);

    console.log(`[Reader V3] News article extracted: ${text.length} chars from ${url.slice(0, 80)}`);
    return text;
  } catch (error: any) {
    console.warn(`[Reader V3] News fetch failed: ${error.message} for ${url.slice(0, 80)}`);
    return null;
  }
}

const NEWS_PROVIDERS = ['gdelt-news', 'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry', 'linkup'];

/**
 * Try to get full text from a source.
 * Priority: pdfUrl → url (if PDF) → news article (if news provider) → abstract
 */
async function getFullText(source: any): Promise<{ text: string; depth: "full_text" | "abstract" }> {
  // Try PDF URL first
  if (source.pdfUrl) {
    const pdfText = await extractPdfText(source.pdfUrl);
    if (pdfText && pdfText.length > 500) {
      return { text: pdfText, depth: "full_text" };
    }
  }

  // Try main URL if it looks like a PDF
  if (source.url && (source.url.endsWith('.pdf') || source.contentFormat === 'pdf')) {
    const pdfText = await extractPdfText(source.url);
    if (pdfText && pdfText.length > 500) {
      return { text: pdfText, depth: "full_text" };
    }
  }

  // For news sources, try fetching the article URL
  if (source.url && NEWS_PROVIDERS.includes(source.provider || '')) {
    const articleText = await fetchNewsArticleText(source.url);
    if (articleText && articleText.length > 300) {
      return { text: articleText, depth: "full_text" };
    }
  }

  // Fallback to abstract
  return {
    text: source.abstract || "",
    depth: "abstract",
  };
}

// ============================================================================
// TEXT CHUNKING
// ============================================================================

interface TextChunk {
  section: string;
  content: string;
  index: number;
}

/**
 * Split a full paper into meaningful sections.
 * Looks for common academic section headers.
 */
function chunkPaper(text: string, maxChunkSize = 4000): TextChunk[] {
  const sectionPatterns = [
    /^(?:1\.?\s*)?(?:introduction|background)/im,
    /^(?:2\.?\s*)?(?:literature\s+review|related\s+work|theoretical\s+framework)/im,
    /^(?:3\.?\s*)?(?:method(?:ology|s)?|research\s+design|data\s+(?:and\s+)?method)/im,
    /^(?:4\.?\s*)?(?:results?|findings|empirical\s+results)/im,
    /^(?:5\.?\s*)?(?:discussion|analysis)/im,
    /^(?:6\.?\s*)?(?:conclusion|concluding\s+remarks|summary)/im,
    /^(?:7\.?\s*)?(?:references|bibliography)/im,
    /^(?:appendix|supplementary)/im,
  ];

  const sectionNames = [
    "introduction", "literature_review", "methodology",
    "results", "discussion", "conclusion", "references", "appendix"
  ];

  // Find section boundaries
  const boundaries: Array<{ name: string; start: number }> = [];

  for (let i = 0; i < sectionPatterns.length; i++) {
    const match = text.match(sectionPatterns[i]);
    if (match && match.index !== undefined) {
      boundaries.push({ name: sectionNames[i], start: match.index });
    }
  }

  // Sort by position
  boundaries.sort((a, b) => a.start - b.start);

  // If no sections found, chunk by size
  if (boundaries.length === 0) {
    const chunks: TextChunk[] = [];
    for (let i = 0; i < text.length; i += maxChunkSize) {
      chunks.push({
        section: `chunk_${chunks.length}`,
        content: text.slice(i, i + maxChunkSize),
        index: chunks.length,
      });
    }
    return chunks;
  }

  // Extract sections
  const chunks: TextChunk[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].start;
    const end = i < boundaries.length - 1 ? boundaries[i + 1].start : text.length;
    const content = text.slice(start, end).trim();

    // Skip references section and very short sections
    if (boundaries[i].name === "references" || boundaries[i].name === "appendix") continue;
    if (content.length < 50) continue;

    // Truncate very long sections
    chunks.push({
      section: boundaries[i].name,
      content: content.slice(0, maxChunkSize),
      index: chunks.length,
    });
  }

  return chunks;
}

// ============================================================================
// DOMAIN-AWARE CONTEXT
// ============================================================================

/**
 * Build domain-specific extraction guidance from the KB and corpus.
 * Tells the Reader what concepts, frameworks, and metrics matter in this domain.
 */
function buildDomainGuidance(domain?: string): string {
  if (!domain) return '';
  const kb = RESEARCHER_KBS[domain as DomainExpertise];
  const corpus = MULTI_DOMAIN_CORPUS[domain as DomainExpertise];
  if (!kb && !corpus) return '';

  const parts: string[] = ['\nDOMAIN CONTEXT (use this to guide extraction):'];
  parts.push(`Domain: ${domain.toUpperCase()}`);

  if (kb) {
    if (kb.keyConcepts?.length) {
      parts.push(`Key concepts to look for: ${kb.keyConcepts.slice(0, 5).map((c: any) => c.name).join(', ')}`);
    }
    if (kb.frameworks?.length) {
      parts.push(`Analytical frameworks: ${kb.frameworks.slice(0, 3).map((f: any) => f.name).join(', ')}`);
    }
    if (kb.qualityCriteria) {
      const criteria = Object.entries(kb.qualityCriteria).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join('; ');
      parts.push(`Quality criteria: ${criteria}`);
    }
  }

  if (corpus?.keyFrameworks?.length) {
    parts.push(`Domain frameworks: ${corpus.keyFrameworks.slice(0, 4).join(', ')}`);
  }

  return parts.join('\n');
}

// ============================================================================
// T5: VERBATIM SPAN VERIFICATION
// ============================================================================

/**
 * Verify that a statedSpan is actually present in the source text.
 * Uses normalized substring matching to handle whitespace differences.
 * Returns true only if a meaningful span (>=20 chars) is found.
 */
function verifyStatedSpan(span: string, sourceText: string): boolean {
  if (!span || span.length < 20) return false;
  if (!sourceText || sourceText.length < 50) return false;

  // Normalize: collapse whitespace, lowercase for comparison
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const normSpan = normalize(span);
  const normText = normalize(sourceText);

  // Direct substring match
  if (normText.includes(normSpan)) return true;

  // Try with first 60 chars (LLM may paraphrase slightly at the end)
  const prefix = normSpan.slice(0, 60);
  if (prefix.length >= 20 && normText.includes(prefix)) return true;

  // Try with last 60 chars
  const suffix = normSpan.slice(-60);
  if (suffix.length >= 20 && normText.includes(suffix)) return true;

  // Try word-level matching: check if >80% of words from span appear in text
  const spanWords = normSpan.split(' ').filter(w => w.length > 3);
  if (spanWords.length < 3) return false;
  const textWords = new Set(normText.split(' '));
  const matched = spanWords.filter(w => textWords.has(w)).length;
  const matchRatio = matched / spanWords.length;
  return matchRatio >= 0.8;
}

// ============================================================================
// DEEP EXTRACTION (LLM-powered)
// ============================================================================

/** Current pipeline domain, set per run */
let _currentDomain: string | undefined;

/**
 * Extract rich structured data from a full paper or abstract.
 * Uses a much more detailed prompt than V2.
 */
async function deepExtract(
  source: any,
  text: string,
  depth: "full_text" | "abstract",
  memoryBlock?: string
): Promise<ReadingResultV3> {
  const isFullText = depth === "full_text";
  const chunks = isFullText ? chunkPaper(text) : [];
  const sections = chunks.map(c => c.section);

  // For full-text: focus on methodology + results sections
  let extractionText = text;
  if (isFullText && chunks.length > 0) {
    // Prioritize: methodology + results + discussion + conclusion
    const prioritySections = ["methodology", "results", "discussion", "conclusion", "introduction"];
    const priorityChunks = chunks
      .filter(c => prioritySections.includes(c.section))
      .map(c => `=== ${c.section.toUpperCase()} ===\n${c.content}`);

    if (priorityChunks.length > 0) {
      extractionText = priorityChunks.join("\n\n");
    }
  }

  // Truncate to fit context window
  extractionText = extractionText.slice(0, 12000);

  const domainGuidance = buildDomainGuidance(_currentDomain);

  // V3.2: Detect source type and build an adaptive prompt
  const sourceType = detectSourceType(source);
  const roleDescription = buildRoleDescription(sourceType);
  const methodsDescriptor = buildMethodsDescriptor(sourceType);
  const resultsDescriptor = buildResultsDescriptor(sourceType);
  const researchDesignOptions = buildResearchDesignOptions(sourceType);
  const quantitativeDescriptor = buildQuantitativeDescriptor(sourceType);
  const isAcademic = sourceType === 'academic';

  const prompt = `${roleDescription}
${memoryBlock ? `\n${memoryBlock}\n` : ''}
TITLE: ${source.title}
AUTHORS: ${(source.authors || []).slice(0, 5).map((a: any) => a.author?.name || a.name || "").filter(Boolean).join(", ") || "N/A"}
YEAR: ${source.year || "N/A"}
SOURCE TYPE: ${sourceType}
READING DEPTH: ${isFullText ? "FULL TEXT" : "ABSTRACT ONLY"}
${isFullText ? `SECTIONS FOUND: ${sections.join(", ")}` : ""}
${domainGuidance}

TEXT:
${extractionText}

EXTRACT the following with maximum precision. ${quantitativeDescriptor}

Return JSON:
{
  "sourceType": "${sourceType}",
  "claims": ["max 5 main claims/findings — be specific, include numbers if available"],
  "methods": ["${methodsDescriptor}"],
  "results": ["${resultsDescriptor}"],
  "limitations": ["max 3 — both stated and implied limitations"],
  "confidence": "high|medium|low",
  "quantitative": {
    "effectSizes": [
      {
        "measure": "Cohen's d|OR|RR|HR|β|r|η²|percentage|count|other",
        "value": 0.0,
        "ci95": [lower, upper] or null,
        "pValue": 0.05 or null,
        "context": "what was measured"
      }
    ],
    "sampleSizes": [
      {"n": 0, "population": "who", "design": "${researchDesignOptions.split('|').join('|')}"}
    ],
    "statisticalTests": ["t-test", "ANOVA", "regression", "chi-square", etc.],
    "keyMetrics": [
      {"name": "metric name", "value": "exact value", "unit": "unit", "context": "what it measures"}
    ]
  },
  "theoreticalFramework": "Main theoretical framework, analytical approach, or policy doctrine used (1-2 sentences)",
  "researchDesign": "${researchDesignOptions}",
  "keyContributions": ["max 3 — what this ${isAcademic ? 'paper' : 'report'} adds to the field"],
  "claimClassifications": [
    {
      "claim": "the claim text (first few words)",
      "type": "consensus|novel|controversial|replication",
      "challengesConsensus": true|false,
      "reasoning": "why this classification"
    }
  ],
  "originalityAssessment": {
    "level": "incremental|moderate|paradigm-shifting",
    "noveltyScore": 0-100,
    "reasoning": "what makes this work novel (or not)"
  },
  "futureDirections": ["max 2 — what the authors suggest for future research or policy action"],
  "citedSources": ["max 5 — key references this ${isAcademic ? 'paper' : 'report'} cites (author, year format)"],
  "mechanisms": [
    {
      "description": "What is the causal mechanism? (e.g., 'Carbon tax reduces emissions by increasing fossil fuel prices')",
      "direction": "positive|negative|reversing|unclear",
      "rate": "Rate of change if stated (e.g., '10% per year') or null",
      "horizon": "Time horizon (e.g., 'short-term', '5-10 years')",
      "isStated": true,
      "sourceRef": null,
      "statedSpan": "EXACT verbatim sentence(s) from the text that states this mechanism. Copy the exact words from the source. If isStated=false (inferred), set to null."
    }
  ]
}

Be PRECISE. Extract EXACT numbers. If a value is not stated, omit it. Do not invent data.
For mechanisms: extract the causal chain — how does X affect Y? What is the direction? Is this explicitly stated by the authors (isStated=true) or inferred (isStated=false)?
For claimClassifications: classify EACH claim as:
- "consensus": aligns with established view in the field
- "novel": presents new evidence or perspective that extends but doesn't challenge consensus
- "controversial": challenges the established consensus or mainstream view
- "replication": replicates or confirms prior findings
Set challengesConsensus=true if the claim contradicts or significantly revises the dominant view.
For originalityAssessment: assess whether this work is incremental (extends existing literature), moderate (new angle/method), or paradigm-shifting (fundamentally changes how the field thinks about the problem).`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 4000,
      enableCache: true,
      task: 'reader_v3',
    });

    const extracted = parseJson<any>(response.content);
    if (!extracted) return ruleBasedExtractionV3(source, text);

    return {
      sourceId: source.id,
      claims: extracted.claims || [],
      methods: extracted.methods || [],
      results: extracted.results || [],
      limitations: extracted.limitations || [],
      confidence: extracted.confidence || "medium",
      // V3.2: record detected source type
      sourceType: extracted.sourceType || sourceType,
      quantitative: {
        effectSizes: extracted.quantitative?.effectSizes || [],
        sampleSizes: extracted.quantitative?.sampleSizes || [],
        statisticalTests: extracted.quantitative?.statisticalTests || [],
        keyMetrics: extracted.quantitative?.keyMetrics || [],
      },
      theoreticalFramework: extracted.theoreticalFramework || "",
      researchDesign: extracted.researchDesign || "unknown",
      keyContributions: extracted.keyContributions || [],
      futureDirections: extracted.futureDirections || [],
      citedSources: extracted.citedSources || [],
      readingDepth: depth,
      wordCount: text.split(/\s+/).length,
      sections,
      mechanisms: (extracted.mechanisms || []).map((m: any) => {
        const desc = String(m.description || '').trim();
        const statedSpan = m.statedSpan ? String(m.statedSpan).trim() : undefined;
        // T5: Verify statedSpan is actually a substring of the source text
        const spanVerified = statedSpan ? verifyStatedSpan(statedSpan, text) : false;
        return {
          description: desc,
          direction: (['positive', 'negative', 'reversing', 'unclear'].includes(m.direction) ? m.direction : 'unclear') as Mechanism['direction'],
          rate: m.rate ? String(m.rate) : undefined,
          horizon: String(m.horizon || 'unspecified').trim(),
          isStated: m.isStated !== false,
          sourceRef: typeof m.sourceRef === 'number' ? m.sourceRef : undefined,
          statedSpan: spanVerified ? statedSpan : undefined,
          spanVerified,
        } as Mechanism;
      }).filter((m: Mechanism) => m.description),
      extractedText: text.slice(0, 8000),
      // V3.1: Claim classifications and originality assessment
      claimClassifications: Array.isArray(extracted.claimClassifications)
        ? extracted.claimClassifications.map((c: any) => ({
            claim: String(c.claim || '').slice(0, 300),
            type: (['consensus', 'novel', 'controversial', 'replication'].includes(c.type) ? c.type : 'consensus') as 'consensus' | 'novel' | 'controversial' | 'replication',
            challengesConsensus: Boolean(c.challengesConsensus),
            reasoning: String(c.reasoning || '').slice(0, 200),
          }))
        : undefined,
      originalityAssessment: extracted.originalityAssessment
        ? {
            level: (['incremental', 'moderate', 'paradigm-shifting'].includes(extracted.originalityAssessment.level)
              ? extracted.originalityAssessment.level
              : 'incremental') as 'incremental' | 'moderate' | 'paradigm-shifting',
            noveltyScore: typeof extracted.originalityAssessment.noveltyScore === 'number'
              ? Math.max(0, Math.min(100, extracted.originalityAssessment.noveltyScore))
              : 0,
            reasoning: String(extracted.originalityAssessment.reasoning || '').slice(0, 300),
          }
        : undefined,
    };
  } catch (error: any) {
    console.warn(`[Reader V3] Deep extraction failed for ${source.id}: ${error.message}`);
    Sentry.captureException(error, { tags: { agent: "reader-v3", sourceId: source.id } });

    // Fallback to rule-based
    return ruleBasedExtractionV3(source, text);
  }
}

// ============================================================================
// RULE-BASED FALLBACK (enhanced)
// ============================================================================

function ruleBasedExtractionV3(source: any, text?: string): ReadingResultV3 {
  const content = text || source.abstract || "";
  const sentences = content
    .split(/[.!?]+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 20 && s.length < 300);

  const claims: string[] = [];
  const methods: string[] = [];
  const results: string[] = [];
  const limitations: string[] = [];
  const effectSizes: QuantitativeData['effectSizes'] = [];
  const keyMetrics: QuantitativeData['keyMetrics'] = [];

  // Pattern matching
  const claimPatterns = /shows|demonstrates|proves|suggests|finds|indicates|reveals|establishes|argues|proposes/i;
  const methodPatterns = /analyzed|examined|studied|conducted|performed|investigated|assessed|evaluated|surveyed|interviewed/i;
  const resultPatterns = /found|observed|noted|reported|resulted|achieved|obtained|identified|increased|decreased/i;
  const limitPatterns = /limitation|challenge|constraint|however|though|limited|difficult|unclear|caveat|caution/i;

  // Extract numbers (effect sizes, percentages, p-values)
  const numberPattern = /(\d+\.?\d*)\s*%/g;
  const pValuePattern = /p\s*[<>=]\s*(\d+\.?\d*)/gi;
  const nPattern = /[Nn]\s*=\s*(\d[\d,]*)/g;

  sentences.forEach((s: string) => {
    if (claimPatterns.test(s) && claims.length < 5) claims.push(s.slice(0, 150));
    if (methodPatterns.test(s) && methods.length < 5) methods.push(s.slice(0, 150));
    if (resultPatterns.test(s) && results.length < 5) results.push(s.slice(0, 150));
    if (limitPatterns.test(s) && limitations.length < 3) limitations.push(s.slice(0, 150));
  });

  // Extract percentages as key metrics
  let match;
  while ((match = numberPattern.exec(content)) !== null && keyMetrics.length < 5) {
    const context = content.slice(Math.max(0, match.index - 50), match.index + match[0].length + 50).trim();
    keyMetrics.push({ name: "percentage", value: match[0], unit: "%", context });
  }

  // Extract p-values
  while ((match = pValuePattern.exec(content)) !== null && effectSizes.length < 5) {
    effectSizes.push({
      measure: "p-value",
      value: parseFloat(match[1]),
      context: content.slice(Math.max(0, match.index - 50), match.index + match[0].length + 50).trim(),
    });
  }

  // Extract sample sizes
  const sampleSizes: QuantitativeData['sampleSizes'] = [];
  while ((match = nPattern.exec(content)) !== null && sampleSizes.length < 3) {
    sampleSizes.push({
      n: parseInt(match[1].replace(/,/g, '')),
      population: "not specified",
      design: "unknown",
    });
  }

  return {
    sourceId: source.id,
    claims: claims.length > 0 ? claims : ["Unable to extract main claims"],
    methods: methods.length > 0 ? methods : ["Methods not clearly stated"],
    results: results.length > 0 ? results : ["Results not explicitly listed"],
    limitations: limitations.length > 0 ? limitations : ["Analysis based on limited text extraction"],
    confidence: "low",
    quantitative: {
      effectSizes,
      sampleSizes,
      statisticalTests: [],
      keyMetrics,
    },
    theoreticalFramework: "",
    researchDesign: "unknown",
    keyContributions: [],
    futureDirections: [],
    citedSources: [],
    readingDepth: "rule_based",
    wordCount: content.split(/\s+/).length,
    sections: [],
    mechanisms: [],
    extractedText: (text || '').slice(0, 8000),
    error: "Fallback to rule-based extraction",
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Reader Agent V3 — Full-text deep extraction with quantitative data.
 * 
 * For each source:
 * 1. Try to download and parse PDF (if pdfUrl available)
 * 2. If PDF fails, use abstract
 * 3. Run deep LLM extraction with quantitative focus
 * 4. If LLM fails, use enhanced rule-based fallback
 * 
 * Returns ReadingResultV3[] which is backward-compatible with ReadingResult.
 */
export async function readerAgentV3(
  sources: any[],
  options: {
    enablePdf?: boolean;       // Default: true
    maxConcurrency?: number;   // Default: 5
    timeout?: number;          // Per-source timeout in ms. Default: 20000
    domain?: string;           // Domain for domain-aware extraction guidance
    memoryBlock?: string;      // Agent memory injection (lessons from past runs)
  } = {}
): Promise<ReadingResultV3[]> {
  assertPermission(AgentRole.READER, "write:claims");

  const { enablePdf = true, maxConcurrency = 5, timeout = 90000, domain, memoryBlock } = options;
  _currentDomain = domain;
  if (domain) console.log(`[Reader V3] Domain-aware mode: ${domain}`);
  if (memoryBlock) console.log(`[Reader V3] Memory injection: ${memoryBlock.length} chars`);

  console.log(`[Reader V3] Processing ${sources.length} sources (PDF: ${enablePdf}, concurrency: ${maxConcurrency})`);

  const results: ReadingResultV3[] = [];

  // Process in batches for concurrency control
  for (let i = 0; i < sources.length; i += maxConcurrency) {
    const batch = sources.slice(i, i + maxConcurrency);
    const batchNum = Math.floor(i / maxConcurrency) + 1;
    const totalBatches = Math.ceil(sources.length / maxConcurrency);

    console.log(`[Reader V3] Batch ${batchNum}/${totalBatches} (${batch.length} sources)`);

    const batchResults = await Promise.allSettled(
      batch.map(async (source) => {
        // Wrap in timeout
        return Promise.race([
          processSource(source, enablePdf, memoryBlock),
          new Promise<ReadingResultV3>((_, reject) =>
            setTimeout(() => reject(new Error('Reader V3 timeout')), timeout)
          ),
        ]);
      })
    );

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.warn(`[Reader V3] Failed: ${batch[idx].id} — ${result.reason?.message || 'Unknown error'}`);
        results.push(ruleBasedExtractionV3(batch[idx]));
      }
    });
  }

  // Stats
  const fullText = results.filter(r => r.readingDepth === 'full_text').length;
  const abstractOnly = results.filter(r => r.readingDepth === 'abstract').length;
  const ruleBased = results.filter(r => r.readingDepth === 'rule_based').length;
  const withQuantData = results.filter(r =>
    r.quantitative.effectSizes.length > 0 ||
    r.quantitative.sampleSizes.length > 0 ||
    r.quantitative.keyMetrics.length > 0
  ).length;

  console.log(`[Reader V3] ✅ Complete: ${fullText} full-text, ${abstractOnly} abstract, ${ruleBased} rule-based | ${withQuantData} with quantitative data`);

  return results;
}

/**
 * Process a single source: get text → extract → return
 */
async function processSource(source: any, enablePdf: boolean, memoryBlock?: string): Promise<ReadingResultV3> {
  // Skip sources with no content at all
  const hasContent = source.abstract?.length > 50 || source.pdfUrl || source.url;
  if (!hasContent) {
    return ruleBasedExtractionV3(source);
  }

  // Get the best available text
  let text: string;
  let depth: "full_text" | "abstract";

  if (enablePdf && (source.pdfUrl || (source.url && source.contentFormat === 'pdf'))) {
    const result = await getFullText(source);
    text = result.text;
    depth = result.depth;
  } else if (source.url && NEWS_PROVIDERS.includes(source.provider || '')) {
    // News sources: always try web fetch even if PDF is disabled
    const result = await getFullText(source);
    text = result.text;
    depth = result.depth;
  } else {
    text = source.abstract || "";
    depth = "abstract";
  }

  // Skip very short content
  if (text.length < 100) {
    return ruleBasedExtractionV3(source, text);
  }

  // Deep extraction
  return deepExtract(source, text, depth, memoryBlock);
}

// ============================================================================
// STORE CHUNKS (for future retrieval)
// ============================================================================

/**
 * Store paper chunks in SourceChunk table for future semantic retrieval.
 * Call this after full-text extraction to enable chunk-level search.
 */
export async function storeSourceChunks(
  sourceId: string,
  text: string
): Promise<number> {
  const crypto = await import('crypto');
  const chunks = chunkPaper(text, 2000);

  if (chunks.length === 0) return 0;

  let stored = 0;
  for (const chunk of chunks) {
    const contentHash = crypto.createHash('sha256').update(chunk.content).digest('hex');

    try {
      await prisma.sourceChunk.upsert({
        where: { contentHash },
        create: {
          sourceId,
          chunkIndex: chunk.index,
          content: chunk.content,
          contentHash,
          tokenCount: Math.ceil(chunk.content.length / 4),
        },
        update: {
          content: chunk.content,
          tokenCount: Math.ceil(chunk.content.length / 4),
        },
      });
      stored++;
    } catch (error: any) {
      // Skip duplicates silently
      if (!error.message.includes('Unique constraint')) {
        console.warn(`[Reader V3] Failed to store chunk ${chunk.index} for ${sourceId}: ${error.message}`);
      }
    }
  }

  console.log(`[Reader V3] Stored ${stored} chunks for source ${sourceId}`);
  return stored;
}
