/**
 * PIPELINE TYPES — Typed stats, lineage, and shared interfaces
 * 
 * Replaces `stats: any` with a fully typed PipelineStats interface.
 * Every pipeline step writes to a well-defined structure.
 */

// ============================================================================
// PIPELINE STATS — replaces `stats: any`
// ============================================================================

export interface PipelineStats {
  // Step 0: Context Primer
  contextPrimer?: {
    knownConcepts: number;
    priorBriefs: number;
    emergingTrends: number;
    trendBreaks: number;
    coverageGap: boolean;
    durationMs: number;
    costUsd?: number;
    error?: string;
  };

  // Step 1: Scout
  scout?: {
    found: number;
    upserted: number;
    sourceIds: string[];
    cached?: boolean;
    providers?: string[];
    durationMs?: number;
  } | any; // backward compat with cached array

  // LOT 2.1: Deep Planner
  deepPlanner?: {
    nodes: number;
    costUsd: number;
  };

  // LOT 2.6: Typed research gaps
  researchGaps?: Array<{
    type: 'NOT_REACHED' | 'RESTRICTED' | 'INEXISTANT';
    description: string;
  }>;

  // LOT 5.1: Style gates
  styleGates?: {
    violations: number;
    passed: boolean;
    gateDetails?: Array<{ gate: string; match: string; suggestion: string }>;
  };

  // LOT 5.7: Numerical gate
  numericalGate?: {
    violations: number;
    passed: boolean;
    details?: Array<{ match: string; suggestion: string }>;
  };

  // LOT 7.1: Predictions registered for retrospective audit
  predictions?: {
    registered: number;
  };

  // LOT 4.2-4.8: Chain probability from meta-analysis
  chainProbability?: {
    priors: number;
    bestJointProbability: number;
    permutations: number;
    scenarios: number;
    inflectionWarning?: string;
  };

  // Step 2: Index
  index?: {
    enriched: number;
    errors: string[];
  };

  // Step 2b: Embed
  embed?: {
    embedded: number;
    skipped: number;
    error?: string;
  };

  // Step 3: Dedup
  dedupe?: {
    removed: number;
  };

  // Step 4b: Topic classification
  topicClassification?: {
    primaryDomain: string;
    domains: Array<{ domain: string; confidence: number }>;
    dimensions?: Array<{ domain: string; label: string; angle: string; confidence: number }>;
    detectedSubject?: string;
    isCrossDomain: boolean;
    confidence: number;
    reasoning?: string;
  };

  // Editorial V2 — casting + arbiter
  casting?: {
    teamSize: number;
    collisionSummary: string;
    costUsd?: number;
  };
  editorialArbiter?: {
    confidence: number;
    confidenceLabel: string;
    scenariosCount: number;
    costUsd?: number;
  };

  // Editorial V2
  editorialV2?: boolean;
  analysis?: Record<string, unknown>;

  // Step 7b: Foresight (Monte Carlo)
  foresight?: {
    scenarios?: number;
    monteCarloRuns?: number;
    converged?: boolean;
    costUsd?: number;
    skipped?: boolean;
    reason?: string;
  };

  // Step 4: Rank
  rank?: {
    count: number;
    avgQuality: number;
  };

  // Step 5: Reader
  reader?: {
    count: number;
    fullText: number;
    withQuantData: number;
  };

  // Step 5b: Agent Memory
  agentMemory?: {
    lessons: number;
    agentId: string;
  };

  // Step 5c: Framing (hypothesis-driven analysis)
  framing?: {
    hypotheses: number;
    keyUnknowns: number;
    costUsd: number;
  };

  // Step 5d: QUANT (primary data exploitation)
  quant?: {
    series: number;
    facts: number;
    providers: string[];
    durationMs: number;
  };
  quantCharts?: number;

  // Step 5e: Hypothesis Judge
  hypothesisJudge?: {
    verdicts: Array<{ id: string; verdict: string; confidence: number }>;
    costUsd: number;
  };

  // Step 6: Analyst
  analyst?: {
    hasDebate: boolean;
    passes?: number;
    keyFindingsCount?: number;
    scenariosCount?: number;
    costUsd?: number;
    depth?: "brief" | "strategic";
  };

  // Topic consistency
  topicConsistency?: {
    passed: boolean;
    issues: string[];
  };

  // Terminal distance check
  terminalDistanceWarning?: string;

  // Step 6a: Structural Editor (storyline review)
  structuralEditor?: {
    overallStructure?: number;
    narrativeArcValid?: boolean;
    sectionsWithIssues?: number;
    logicalGaps?: number;
    costUsd?: number;
    restructured?: boolean;
    skipped?: boolean;
    error?: string;
  };

  // Step 6b: Harvard Council
  harvardCouncil?: {
    enhanced?: boolean;
    experts?: number;
    domainLeads?: number;
    interdisciplinary?: {
      connections: number;
      conflicts: number;
      synergies: number;
    };
    evidenceLevel?: string;
    avgConfidence?: number;
    gradeCertainty?: string;
    reviewers?: number;
    avgRigor?: number;
    predictions?: number;
    recommendations?: number | {
      immediate: number;
      shortTerm: number;
      longTerm: number;
      research: number;
    };
    costUsd?: number;
    durationMs?: number;
    skipped?: boolean;
    error?: string;
  };

  // Step 6c: Deliberation
  deliberation?: {
    challenges?: number;
    criticalChallenges?: number;
    consensusPoints?: number;
    activeDisagreements?: number;
    emergentInsights?: number;
    deliberationDepth?: number;
    consensusLevel?: number;
    costUsd?: number;
    skipped?: boolean;
    error?: string;
  };

  // Step 7: Citation Guard
  guard?: {
    ok: boolean;
    usedCount: number;
    invalid: number[];
  };
  citationGuardDegraded?: boolean;

  // Step 8: Editor
  htmlLength?: number;
  rendererUsed?: "position_first" | "professional_strategic" | "professional_brief" | "legacy_strategic" | "legacy_brief";

  // Step 9: Citation Verifier
  citationVerifier?: {
    integrity: number;
    supported: number;
    flagged: number;
    costUsd?: number;
  };

  // Step 9b: Fact-Checker
  factChecker?: {
    totalClaims?: number;
    verified?: number;
    majorIssues?: number;
    fatalIssues?: number;
    integrityScore?: number;
    error?: string;
  };
  factCheckerFatalFlagged?: boolean;

  // Step 10: Critical Loop
  criticalLoop?: {
    iterations: number;
    finalScore: number;
    improvement: number;
    needsHumanReview: boolean;
  };

  // Step 11: Debate
  debate?: {
    confidenceInDominant?: number;
    steelManStrength?: string;
    nuances?: number;
    costUsd?: number;
    skipped?: boolean;
    error?: string;
  };

  // Step 12: Meta-Analysis
  metaAnalysis?: {
    k?: number;
    pooledEffect?: number;
    I2?: number;
    biasDetected?: boolean;
    forestPlotEntries?: number;
    skipped?: boolean;
    error?: string;
  };

  // Step 13: Devil's Advocate
  devilsAdvocate?: {
    verdict?: string;
    overallStrength?: number;
    publishabilityScore?: number;
    fatalChallenges?: number;
    majorChallenges?: number;
    vsInstitutions?: string;
    institutionScores?: {
      mckinsey: number;
      brookings: number;
      rand: number;
      franceStrategie: number;
    };
    gaps?: string[];
    costUsd?: number;
    autoRevised?: boolean;
    skipped?: boolean;
    error?: string;
  };

  // Step 5c: Gap-Aware Evidence Append
  gapAnalysis?: {
    gapsFound: number;
    queriesGenerated: number;
    newSources: number;
  };

  // Step 8b: Citation Filter (post-generation)
  citationFilter?: {
    backtracked: number;
    removed: number;
    coverageBefore: number;
    coverageAfter: number;
  };

  // Step 8c: Citation Repair (deterministic post-render)
  citationRepair?: {
    backfilled: number;
    injected: number;
    sanitized: number;
  };

  // Step 8d: Claim Grounding (deterministic lexical verification)
  claimGrounding?: {
    supported: number;
    partial: number;
    unsupported: number;
    uncited: number;
    contradicted: number;
    groundedness: number;
    flagged: number;
  };

  // Step 8e: Post-critical-loop repair (fixes rewrite-introduced issues)
  postLoopRepair?: {
    backfilled: number;
    injected: number;
    sanitized: number;
  };
  postLoopGrounding?: {
    supported: number;
    partial: number;
    unsupported: number;
    uncited: number;
    contradicted: number;
    groundedness: number;
    flagged: number;
  };

  // Step 13b: Triangular Judge (DA dispute arbitration)
  triangularJudge?: {
    verdict: string;
    revisedVerdict: string;
    confidence: number;
  };

  // Hero image generation
  heroImage?: {
    generated: boolean;
    costUsd: number;
  };

  // Structured refusal (P3.9)
  structuredRefusal?: {
    reason: string;
    sourceCount: number;
    required: number;
    missing: string[];
  };

  // Enrichment Reasoner (adaptive evidence sufficiency)
  enrichmentReasoner?: {
    verdict: 'proceed' | 'enrich' | 'refuse';
    sufficiencyScore: number;
    gapsFound: number;
    enrichmentQueries: string[];
    newSourcesAdded: number;
    costUsd: number;
  };

  // Stable evidence IDs (P3.8)
  evidenceRegistry?: {
    total: number;
    cited: number;
    uncited: number;
  };

  // Step 14: Publisher
  brief?: {
    id: string;
    estimatedPages?: number;
  };

  // Step 15: Knowledge Graph
  knowledgeGraph?: {
    concepts: number;
    relations: number;
    costUsd?: number;
    error?: string;
  };

  // Orchestrator
  orchestrator?: {
    decisions: any[];
    expandedTerms?: string[];
  };

  // Aggregate accounting
  totalCostUsd?: number;

  // Error
  error?: string;
}

// ============================================================================
// DATA LINEAGE
// ============================================================================

export interface DataLineage {
  briefId: string;
  query: string;
  timestamp: Date;
  transformations: Array<{
    step: "scout" | "index" | "rank" | "read" | "analyze" | "guard" | "render";
    inputCount: number;
    outputCount: number;
    durationMs: number;
    sourceIds?: string[];
    filters?: Record<string, any>;
    errors?: string[];
  }>;
  sourceLineage: Map<string, {
    sourceId: string;
    provider: string;
    qualityScore: number;
    inFinalBrief: boolean;
    citations: number[];
  }>;
}

export function createLineageTracker(briefId: string, query: string): DataLineage {
  return {
    briefId,
    query,
    timestamp: new Date(),
    transformations: [],
    sourceLineage: new Map()
  };
}

export function recordTransformation(
  lineage: DataLineage,
  step: DataLineage["transformations"][0]["step"],
  inputCount: number,
  outputCount: number,
  durationMs: number,
  metadata?: Record<string, any>
) {
  lineage.transformations.push({
    step,
    inputCount,
    outputCount,
    durationMs,
    ...metadata
  });
  console.log(`[Lineage] ${step}: ${inputCount} → ${outputCount} (${durationMs}ms)`);
}

export function exportLineageJSON(lineage: DataLineage): string {
  return JSON.stringify({
    ...lineage,
    sourceLineage: Array.from(lineage.sourceLineage.entries())
  }, null, 2);
}

// ============================================================================
// APA CITATION FORMATTER
// ============================================================================

export interface APACitation {
  index: number;
  authors: string;
  year: string;
  title: string;
  source: string; // journal, publisher, provider
  doi?: string;
  url?: string;
}

/**
 * Format a source into APA 7th edition citation
 */
export function formatAPA(source: any, index: number): APACitation {
  // Extract authors
  const authorList = source.authors
    ?.map((sa: any) => sa.author?.name || sa.name)
    .filter(Boolean) || [];
  
  let authors: string;
  if (authorList.length === 0) {
    authors = "Unknown Author";
  } else if (authorList.length === 1) {
    authors = formatAuthorName(authorList[0]);
  } else if (authorList.length === 2) {
    authors = `${formatAuthorName(authorList[0])} & ${formatAuthorName(authorList[1])}`;
  } else if (authorList.length <= 20) {
    const formatted = authorList.map(formatAuthorName);
    authors = `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
  } else {
    const formatted = authorList.slice(0, 19).map(formatAuthorName);
    authors = `${formatted.join(", ")}, ... ${formatAuthorName(authorList[authorList.length - 1])}`;
  }

  const year = source.year ? String(source.year) : "n.d.";
  const title = source.title || "Untitled";
  
  // Determine source type for proper APA formatting
  const journalName = source.raw?.primary_location?.source?.display_name 
    || source.raw?.container_title?.[0]
    || source.raw?.journal_name
    || null;

  let sourceLine: string;
  if (journalName) {
    sourceLine = journalName;
  } else if (source.provider) {
    const providerNames: Record<string, string> = {
      'openalex': 'OpenAlex',
      'crossref': 'Crossref',
      'semanticscholar': 'Semantic Scholar',
      'arxiv': 'arXiv',
      'pubmed': 'PubMed',
      'hal': 'HAL Archives',
      'gdelt-news': 'GDELT News',
      'newsapi': 'NewsAPI',
      'ssrn': 'SSRN',
      'repec': 'RePEc',
    };
    sourceLine = providerNames[source.provider] || source.provider;
  } else {
    sourceLine = "Unknown Source";
  }

  return {
    index,
    authors,
    year,
    title,
    source: sourceLine,
    doi: source.doi || undefined,
    url: source.url || source.pdfUrl || undefined,
  };
}

/**
 * Format author name as "Last, F. I."
 */
function formatAuthorName(name: string): string {
  if (!name) return "Unknown";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map(p => `${p[0]}.`).join(" ");
  return `${last}, ${initials}`;
}

/**
 * Render APA citation as HTML
 */
export function renderAPAHtml(citation: APACitation): string {
  const esc = (s: string) => String(s || "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] as string));

  let html = `<span class="apa-ref" id="ref-${citation.index}">`;
  html += `<span class="ref-num">[${citation.index}]</span> `;
  html += `${esc(citation.authors)} (${esc(citation.year)}). `;
  html += `<em>${esc(citation.title)}</em>. `;
  html += `${esc(citation.source)}.`;
  
  if (citation.doi) {
    html += ` <a href="https://doi.org/${esc(citation.doi)}" target="_blank" rel="noopener" style="color:#3B82F6;">https://doi.org/${esc(citation.doi)}</a>`;
  } else if (citation.url) {
    html += ` <a href="${esc(citation.url)}" target="_blank" rel="noopener" style="color:#3B82F6;">${esc(citation.url)}</a>`;
  }
  
  html += `</span>`;
  return html;
}
