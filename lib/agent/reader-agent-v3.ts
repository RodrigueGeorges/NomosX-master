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
  error?: string;
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

    // Use require for pdf-parse (CommonJS module)
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(Buffer.from(response.data));

    if (!data.text || data.text.trim().length < 100) {
      console.log(`[Reader V3] PDF parsed but too short (${data.text?.length || 0} chars)`);
      return null;
    }

    console.log(`[Reader V3] PDF extracted: ${data.text.length} chars, ${data.numpages} pages`);
    return data.text;
  } catch (error: any) {
    console.warn(`[Reader V3] PDF extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * Try to get full text from a source.
 * Priority: pdfUrl → url (if PDF) → abstract
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
  depth: "full_text" | "abstract"
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

  const prompt = `You are a PhD-level research analyst performing DEEP EXTRACTION from an academic paper.

TITLE: ${source.title}
AUTHORS: ${(source.authors || []).slice(0, 5).map((a: any) => a.author?.name || a.name || "").filter(Boolean).join(", ") || "N/A"}
YEAR: ${source.year || "N/A"}
READING DEPTH: ${isFullText ? "FULL PAPER" : "ABSTRACT ONLY"}
${isFullText ? `SECTIONS FOUND: ${sections.join(", ")}` : ""}
${domainGuidance}

TEXT:
${extractionText}

EXTRACT the following with maximum precision. For quantitative data, extract EXACT numbers.

Return JSON:
{
  "claims": ["max 5 main claims/hypotheses — be specific, include numbers if available"],
  "methods": ["max 5 methods — include design type, sample details, analytical approach"],
  "results": ["max 5 key findings — include effect sizes, p-values, confidence intervals if stated"],
  "limitations": ["max 3 — both stated and implied limitations"],
  "confidence": "high|medium|low",
  "quantitative": {
    "effectSizes": [
      {
        "measure": "Cohen's d|OR|RR|HR|β|r|η²|percentage|other",
        "value": 0.0,
        "ci95": [lower, upper] or null,
        "pValue": 0.05 or null,
        "context": "what was measured"
      }
    ],
    "sampleSizes": [
      {"n": 0, "population": "who", "design": "RCT|cohort|cross-sectional|survey|case-control|meta-analysis|qualitative|theoretical"}
    ],
    "statisticalTests": ["t-test", "ANOVA", "regression", "chi-square", etc.],
    "keyMetrics": [
      {"name": "metric name", "value": "exact value", "unit": "unit", "context": "what it measures"}
    ]
  },
  "theoreticalFramework": "Main theoretical framework or approach used (1-2 sentences)",
  "researchDesign": "RCT|quasi-experimental|observational|qualitative|mixed-methods|meta-analysis|theoretical|computational",
  "keyContributions": ["max 3 — what this paper adds to the field"],
  "futureDirections": ["max 2 — what the authors suggest for future research"],
  "citedSources": ["max 5 — key references this paper cites (author, year format)"]
}

Be PRECISE. Extract EXACT numbers. If a value is not stated, omit it. Do not invent data.`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 4000,
      enableCache: true,
      task: 'reader_v3',
    });

    const extracted = JSON.parse(response.content);

    return {
      sourceId: source.id,
      claims: extracted.claims || [],
      methods: extracted.methods || [],
      results: extracted.results || [],
      limitations: extracted.limitations || [],
      confidence: extracted.confidence || "medium",
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
  } = {}
): Promise<ReadingResultV3[]> {
  assertPermission(AgentRole.READER, "write:claims");

  const { enablePdf = true, maxConcurrency = 5, timeout = 20000, domain } = options;
  _currentDomain = domain;
  if (domain) console.log(`[Reader V3] Domain-aware mode: ${domain}`);

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
          processSource(source, enablePdf),
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
async function processSource(source: any, enablePdf: boolean): Promise<ReadingResultV3> {
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
  } else {
    text = source.abstract || "";
    depth = "abstract";
  }

  // Skip very short content
  if (text.length < 100) {
    return ruleBasedExtractionV3(source, text);
  }

  // Deep extraction
  return deepExtract(source, text, depth);
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
