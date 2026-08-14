/**
 * Adaptive Evidence Gatherer
 *
 * Instead of rejecting topics with insufficient/misaligned sources, this module
 * acts like a real researcher: decomposes the question into researchable sub-angles,
 * searches each independently, combines all sources, and reassesses.
 *
 * Flow:
 *   1. Initial search → assess alignment
 *   2. If misaligned or insufficient → LLM decomposes into 3-5 sub-angles
 *   3. Search each sub-angle across multiple providers
 *   4. Combine + dedup all sources
 *   5. Semantic reassessment
 *   6. Return enriched source pool + reformulated question (if needed)
 */

import { searchOpenAlex } from '../providers/academic/openalex-api';
import { searchCrossref } from '../providers/academic/crossref-api';
import { searchSemanticScholar } from '../providers/semanticscholar';
import { searchArxiv } from '../providers/arxiv';

export interface GatheredSource {
  id: string;
  title: string;
  provider: string;
  year?: string | number;
  abstract?: string;
  url?: string;
  qualityScore?: number;
}

export interface EvidenceGatherResult {
  sources: GatheredSource[];
  reformulatedQuestion: string | null;
  subAngles: string[];
  semanticScore: number;
  semanticReasoning: string;
  viable: boolean;
  strategy: 'direct' | 'decomposed' | 'reformulated';
  costUsd: number;
  durationMs: number;
}

const GATHER_TIMEOUT_MS = 20_000;
const MIN_SOURCES_FOR_VIABLE = 8;
const MIN_RELEVANT_SOURCES = 5; // absolute count of relevant sources needed
const SEMANTIC_FRACTION_THRESHOLD = 0.3; // 30% of sampled titles must be relevant

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * LLM-powered semantic alignment check.
 * Returns the fraction of sources that are genuinely relevant to the question.
 */
async function checkSemanticAlignment(
  question: string,
  sourceTitles: string[]
): Promise<{ score: number; reasoning: string; misalignedTopics: string[] }> {
  if (sourceTitles.length === 0) {
    return { score: 0, reasoning: 'No sources to check', misalignedTopics: [] };
  }
  try {
    const { callLLM } = await import('../llm/unified-llm');
    const titlesList = sourceTitles.slice(0, 10).map((t, i) => `[${i + 1}] ${t}`).join('\n');
    const response = await callLLM({
      messages: [
        {
          role: 'user',
          content: `You are a research relevance assessor. Given a research question and source titles, determine what fraction are genuinely relevant.

RESEARCH QUESTION: ${question}

SOURCE TITLES:
${titlesList}

Return JSON:
{
  "relevantCount": <number genuinely relevant>,
  "totalCount": ${Math.min(sourceTitles.length, 10)},
  "reasoning": "1 sentence",
  "misalignedTopics": ["what the sources are actually about, if misaligned"]
}`,
        },
      ],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 300,
      task: 'preflight_semantic_check',
    });
    const parsed = JSON.parse(response.content);
    const score = parsed.totalCount > 0 ? parsed.relevantCount / parsed.totalCount : 0;
    return {
      score,
      reasoning: parsed.reasoning || 'No reasoning',
      misalignedTopics: parsed.misalignedTopics || [],
    };
  } catch {
    return { score: 1, reasoning: 'Semantic check skipped', misalignedTopics: [] };
  }
}

/**
 * LLM-powered question decomposition into researchable sub-angles.
 * Instead of reformulating the question, we break it into its constituent
 * researchable parts — each of which is likely to have academic literature.
 */
async function decomposeQuestion(question: string, misalignmentHint?: string): Promise<string[]> {
  try {
    const { callLLM } = await import('../llm/unified-llm');
    const hint = misalignmentHint ? `\n\nNOTE: Initial search found sources about: "${misalignmentHint}". The question may need to be broken into more standard academic sub-topics.` : '';
    const response = await callLLM({
      messages: [
        {
          role: 'user',
          content: `You are a research strategist at a think tank. A colleague has a research question but is struggling to find academic literature on it. Break the question into 3-5 sub-angles, each of which is independently researchable and likely to have academic literature.

RESEARCH QUESTION: ${question}${hint}

Rules:
- Each sub-angle should be a standalone search query (not a question, a search phrase)
- Use standard academic terminology that databases index well
- Cover different facets: theoretical, empirical, comparative, policy
- If the question is about a specific case, generalize to the broader research domain
- Each sub-angle should find DIFFERENT sources, not overlap

Examples:
- "How does fintech affect Gaza humanitarian aid?" → ["digital financial inclusion conflict zones", "mobile money humanitarian assistance", "financial technology economic resilience fragile states", "cash transfer digital delivery war"]
- "Impact of EU AI Act on startups" → ["EU AI Act regulatory compliance", "AI regulation innovation effects", "technology startup regulatory burden Europe", "artificial intelligence governance policy"]

Return JSON: { "subAngles": ["search phrase 1", "search phrase 2", ...] }`,
        },
      ],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 400,
      task: 'query_reformulation',
    });
    const parsed = JSON.parse(response.content);
    const angles = (parsed.subAngles || []).filter((a: string) => a && a.length > 5);
    return angles.slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Retrieve foundational theories and seminal works from EXISTING knowledge systems:
 *   - RESEARCHER_KBS[domain].referencePapers — seminal papers per domain
 *   - MULTI_DOMAIN_CORPUS[domain].seminalWorks — domain canon
 *   - gap-filler — known knowledge gaps to proactively address
 *
 * This grounds the analysis in established academic canon without redundant LLM calls.
 */
async function identifyFoundationalTheories(question: string, domain?: string): Promise<{
  searchQueries: string[];
  seminalTitles: string[];
  gapQueries: string[];
}> {
  const searchQueries: string[] = [];
  const seminalTitles: string[] = [];
  const gapQueries: string[] = [];

  // 1. Pull seminal works from Researcher KB (deterministic, no LLM)
  try {
    const { getResearcherKB } = await import('./researcher-kb/index');
    const { knowledgeBase } = await import('../knowledge/multi-domain-corpus');

    // Try to match domain — the question may not have a domain yet, so try a few
    const candidateDomains = domain
      ? [domain as any]
      : ['economics', 'policy', 'security', 'technology', 'geopolitics', 'finance', 'social-sciences'];

    for (const d of candidateDomains) {
      const kb = getResearcherKB(d);
      if (kb?.referencePapers && kb.referencePapers.length > 0) {
        // Use seminal paper titles as search queries to find related literature
        for (const paper of kb.referencePapers.slice(0, 3)) {
          seminalTitles.push(paper.title);
          // Use the paper title + key concept as a search query
          searchQueries.push(`${paper.title} ${question.split(' ').slice(0, 5).join(' ')}`);
        }
        break; // Use the first matching domain
      }
    }

    // 2. Pull seminal works from multi-domain corpus
    for (const d of candidateDomains) {
      const seminal = knowledgeBase.getSeminalWorks(d);
      if (seminal && seminal.length > 0) {
        seminalTitles.push(...seminal.slice(0, 3));
        break;
      }
      const frameworks = knowledgeBase.getKeyFrameworks(d);
      if (frameworks && frameworks.length > 0) {
        searchQueries.push(...frameworks.slice(0, 2).map((f: string) => `${f} ${question.split(' ').slice(0, 4).join(' ')}`));
        break;
      }
    }
  } catch {
    // KB systems unavailable — continue without foundational grounding
  }

  // 3. Pull known knowledge gaps from gap-filler (proactive gap addressing)
  try {
    const { getRelevantGaps } = await import('./gap-filler');
    const gapInjection = await getRelevantGaps(question, domain || 'general', 3);
    if (gapInjection.gapQueries?.length > 0) {
      gapQueries.push(...gapInjection.gapQueries.slice(0, 3));
    }
  } catch {
    // Gap-filler unavailable — continue
  }

  return { searchQueries: searchQueries.slice(0, 5), seminalTitles, gapQueries };
}

/**
 * Search a single query across multiple provider layers in parallel:
 *   Layer 1: Academic (OpenAlex, Crossref, Semantic Scholar, ArXiv) — always
 *   Layer 2: Web search (Tavily, Exa) — when includeWeb=true
 *   Layer 3: News (GDELT) — when includeWeb=true (for current events)
 *   Layer 4: Institutional/think tanks via registry bridge — when domain provided
 */
async function searchAcrossProviders(
  query: string,
  limit: number = 10,
  options?: { includeWeb?: boolean; domain?: string }
): Promise<GatheredSource[]> {
  const includeWeb = options?.includeWeb ?? false;
  const domain = options?.domain;

  // ── Layer 1: Academic providers (always) ──
  const academicPromises: Promise<any[]>[] = [
    withTimeout(searchOpenAlex(query, limit), GATHER_TIMEOUT_MS, 'openalex'),
    withTimeout(searchCrossref(query, limit), GATHER_TIMEOUT_MS, 'crossref'),
    withTimeout(searchSemanticScholar(query, limit), GATHER_TIMEOUT_MS, 's2'),
    withTimeout(searchArxiv(query, limit), GATHER_TIMEOUT_MS, 'arxiv'),
  ];
  const academicLabels = ['openalex', 'crossref', 'semantic-scholar', 'arxiv'];

  // ── Layer 2: Web search (Tavily, Exa) ──
  if (includeWeb) {
    try {
      const { searchTavily } = await import('../providers/tavily-provider');
      academicPromises.push(withTimeout(searchTavily(query, Math.floor(limit / 2), { topic: 'general' }), GATHER_TIMEOUT_MS, 'tavily'));
      academicLabels.push('tavily');
    } catch { /* Tavily not available */ }
    try {
      const { searchExaPublications } = await import('../providers/exa-provider');
      academicPromises.push(withTimeout(searchExaPublications(query, Math.floor(limit / 2)), GATHER_TIMEOUT_MS, 'exa'));
      academicLabels.push('exa');
    } catch { /* Exa not available */ }
  }

  // ── Layer 3: News (GDELT — free, no API key) ──
  if (includeWeb) {
    try {
      const { searchGDELTNews } = await import('../providers/news-scout-providers');
      academicPromises.push(withTimeout(searchGDELTNews(query, Math.floor(limit / 2)), GATHER_TIMEOUT_MS, 'gdelt-news'));
      academicLabels.push('gdelt-news');
    } catch { /* GDELT not available */ }
  }

  // ── Layer 4: Institutional/think tanks via registry bridge ──
  if (domain) {
    try {
      const { searchExtendedProviders, getExtendedProvidersForDomain } = await import('../providers/registry-bridge');
      const extProviders = getExtendedProvidersForDomain(domain).slice(0, 5);
      if (extProviders.length > 0) {
        const extResults = await withTimeout(
          searchExtendedProviders(query, { providers: extProviders, limit: Math.floor(limit / 2) }),
          GATHER_TIMEOUT_MS,
          'extended-registry'
        );
        // Add extended results directly
        for (const s of (extResults || [])) {
          if (s.title) {
            academicPromises.push(Promise.resolve([s]));
            academicLabels.push(s.provider || 'extended-registry');
          }
        }
      }
    } catch { /* Registry bridge not available */ }
  }

  const results = await Promise.allSettled(academicPromises);

  const sources: GatheredSource[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const provider = academicLabels[i];
    if (result.status === 'fulfilled') {
      for (const s of (result.value || [])) {
        if (s.title) {
          sources.push({
            id: s.id || `${provider}:${s.doi || s.title}`,
            title: s.title,
            provider: s.provider || provider,
            year: s.year,
            abstract: s.abstract,
            url: s.url,
            qualityScore: s.qualityScore,
          });
        }
      }
    }
  }

  return sources;
}

/**
 * Deduplicate sources by normalized title.
 */
function dedupByTitle(sources: GatheredSource[]): GatheredSource[] {
  const seen = new Set<string>();
  const result: GatheredSource[] = [];
  for (const s of sources) {
    const normalized = s.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(s);
    }
  }
  return result;
}

/**
 * Adaptive evidence gatherer — the main entry point.
 *
 * Strategy:
 * 1. Search the question directly
 * 2. Check semantic alignment
 * 3. If misaligned or insufficient → decompose into sub-angles
 * 4. Search each sub-angle
 * 5. Combine + dedup
 * 6. Reassess
 * 7. Return enriched pool
 */
export async function gatherEvidence(
  question: string,
  options?: { maxSubAngles?: number; maxSourcesPerAngle?: number; domain?: string; includeWeb?: boolean }
): Promise<EvidenceGatherResult> {
  const start = Date.now();
  const maxSubAngles = options?.maxSubAngles ?? 4;
  const maxSourcesPerAngle = options?.maxSourcesPerAngle ?? 8;
  const includeWeb = options?.includeWeb ?? true; // Default: web search enabled
  const domain = options?.domain;
  let costUsd = 0;

  // ── Phase 1: Direct search (academic + web + news + institutional) ──
  const directSources = await searchAcrossProviders(question, 10, { includeWeb, domain });
  const directTitles = directSources.map(s => s.title);

  // ── Phase 2: Semantic check ──
  const semantic = await checkSemanticAlignment(question, directTitles);
  costUsd += 0.0002; // LLM cost estimate

  const directDeduped = dedupByTitle(directSources);

  // If direct search is sufficient and aligned → done
  // Viability = enough sources AND enough relevant ones (absolute count, not just fraction)
  const directRelevantCount = Math.round(semantic.score * Math.min(directDeduped.length, 10));
  const directViable = directDeduped.length >= MIN_SOURCES_FOR_VIABLE &&
    (semantic.score >= SEMANTIC_FRACTION_THRESHOLD || directRelevantCount >= MIN_RELEVANT_SOURCES);

  if (directViable) {
    return {
      sources: directDeduped,
      reformulatedQuestion: null,
      subAngles: [],
      semanticScore: semantic.score,
      semanticReasoning: semantic.reasoning,
      viable: true,
      strategy: 'direct',
      costUsd,
      durationMs: Date.now() - start,
    };
  }

  // ── Phase 3: Decompose into sub-angles AND retrieve foundational theories in parallel ──
  // The foundational theories come from existing KB systems (RESEARCHER_KBS, MULTI_DOMAIN_CORPUS)
  // and known knowledge gaps (gap-filler) — no redundant LLM calls.
  const misalignmentHint = semantic.misalignedTopics.join('; ');
  const [subAngles, foundational] = await Promise.all([
    decomposeQuestion(question, misalignmentHint),
    identifyFoundationalTheories(question, options?.domain),
  ]);
  costUsd += 0.0003;

  // Combine sub-angles with foundational theory search queries and gap queries
  const allSearchQueries = [
    ...subAngles,
    ...foundational.searchQueries.filter(q => !subAngles.includes(q)),
    ...foundational.gapQueries.filter(q => !subAngles.includes(q)),
  ];

  if (allSearchQueries.length === 0) {
    // Decomposition failed — return what we have
    return {
      sources: directDeduped,
      reformulatedQuestion: null,
      subAngles: [],
      semanticScore: semantic.score,
      semanticReasoning: semantic.reasoning,
      viable: directDeduped.length >= MIN_SOURCES_FOR_VIABLE,
      strategy: 'direct',
      costUsd,
      durationMs: Date.now() - start,
    };
  }

  // ── Phase 4: Search each sub-angle + foundational theory in parallel ──
  const subAngleResults = await Promise.all(
    allSearchQueries.slice(0, maxSubAngles + 3).map(angle =>
      searchAcrossProviders(angle, maxSourcesPerAngle, { includeWeb, domain })
    )
  );

  // ── Phase 5: Combine + dedup ──
  const allSources = dedupByTitle([
    ...directDeduped,
    ...subAngleResults.flat(),
  ]);

  // Log foundational grounding
  if (foundational.seminalTitles.length > 0 || foundational.gapQueries.length > 0) {
    console.log(`[EVIDENCE-GATHERER] Grounded with ${foundational.seminalTitles.length} seminal works, ${foundational.gapQueries.length} known gaps addressed`);
  }

  // ── Phase 6: Reassess with combined pool ──
  const combinedTitles = allSources.map(s => s.title);
  const reassessment = await checkSemanticAlignment(question, combinedTitles);
  costUsd += 0.0002;

  // Viability = enough sources AND enough relevant ones (absolute count)
  const combinedRelevantCount = Math.round(reassessment.score * Math.min(allSources.length, 10));
  // Extrapolate: if 30% of a 10-title sample is relevant, and we have 100 sources,
  // that's ~30 relevant sources — more than enough
  const extrapolatedRelevant = reassessment.score * allSources.length;

  // Determine if we need a reformulated question
  let reformulatedQuestion: string | null = null;
  const isViable = allSources.length >= MIN_SOURCES_FOR_VIABLE &&
    (reassessment.score >= SEMANTIC_FRACTION_THRESHOLD ||
     combinedRelevantCount >= MIN_RELEVANT_SOURCES ||
     extrapolatedRelevant >= MIN_RELEVANT_SOURCES * 2);

  if (isViable && semantic.score < SEMANTIC_FRACTION_THRESHOLD) {
    // Original was misaligned but decomposition found enough — use best sub-angle as framing
    reformulatedQuestion = subAngles[0];
  }

  const viable = isViable;
  const strategy = reformulatedQuestion ? 'reformulated' : 'decomposed';

  return {
    sources: allSources,
    reformulatedQuestion,
    subAngles,
    semanticScore: reassessment.score,
    semanticReasoning: reassessment.reasoning,
    viable,
    strategy,
    costUsd,
    durationMs: Date.now() - start,
  };
}
