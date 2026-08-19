/**
 * Research Patterns — STORM + PaperQA2 — NomosX Sprint 6 (Gap 13)
 *
 * Deux patterns récents pour améliorer le research agent :
 * 1. STORM (Stanford, NAACL 2024) — perspective-guided question asking
 * 2. PaperQA2 (FutureHouse, arxiv 2409.13740) — citation traversal
 *
 * Le problème :
 * L'Intelligent Scout a 6 lenses mais pas :
 * - STORM : simuler différents profils d'experts pour générer des questions de recherche
 * - PaperQA2 : suivre les références des top sources pour enrichir le corpus
 *
 * Architecture :
 * 1. STORM mode : générer un outline multi-perspectives via simulation
 * 2. Citation traversal : pour chaque top source, récupérer ses références
 * 3. Question expansion : élargir la recherche avec les questions STORM
 *
 * Intégration : Intelligent Scout et READER V3.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StormPerspective {
  /** Name/role of the perspective */
  name: string;
  /** Description of this perspective */
  description: string;
  /** Questions this perspective would ask */
  questions: string[];
}

export interface StormOutline {
  /** The query */
  query: string;
  /** Perspectives generated */
  perspectives: StormPerspective[];
  /** Research questions to answer */
  questions: string[];
  /** Sections of the final report */
  sections: string[];
  /** Cost in USD */
  costUsd: number;
}

export interface CitationTraversalResult {
  /** Source ID we started from */
  sourceId: string;
  /** References found */
  references: Array<{
    title: string;
    authors: string[];
    year?: number;
    doi?: string;
    source?: string;
  }>;
  /** References relevant to the query */
  relevantReferences: Array<{ title: string; reason: string }>;
  /** New search queries suggested */
  followUpQueries: string[];
  /** Cost in USD */
  costUsd: number;
}

export interface ResearchPatternsConfig {
  /** Number of perspectives for STORM (default: 5) */
  numPerspectives: number;
  /** Number of questions per perspective (default: 3) */
  questionsPerPerspective: number;
  /** Number of references to follow per top source (default: 10) */
  maxReferences: number;
  /** Relevance threshold for references (default: 0.6) */
  relevanceThreshold: number;
  /** Whether to enable STORM */
  enableStorm: boolean;
  /** Whether to enable citation traversal */
  enableCitationTraversal: boolean;
}

export const DEFAULT_RESEARCH_PATTERNS_CONFIG: ResearchPatternsConfig = {
  numPerspectives: 5,
  questionsPerPerspective: 3,
  maxReferences: 10,
  relevanceThreshold: 0.6,
  enableStorm: true,
  enableCitationTraversal: true,
};

// ─── STORM: Perspective-Guided Question Asking ──────────────────────────────

/**
 * Generate multiple perspectives on a research question.
 * Each perspective represents a different expert/discipline that would care about the topic.
 */
export async function generateStormPerspectives(
  query: string,
  config: ResearchPatternsConfig = DEFAULT_RESEARCH_PATTERNS_CONFIG,
): Promise<{ perspectives: StormPerspective[]; costUsd: number }> {
  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a research question generator using the STORM method (Synthesis of Topic Outlines through Retrieval and Multi-perspective Question Asking).

Given a research query, generate ${config.numPerspectives} distinct perspectives (each representing a different expert/discipline). For each perspective, generate ${config.questionsPerPerspective} questions they would want answered.

Output JSON:
{
  "perspectives": [
    {
      "name": "Economist",
      "description": "Care about costs, efficiency, incentives",
      "questions": ["What is the cost-benefit analysis?", ...]
    },
    ...
  ]
}

Guidelines:
- Perspectives should be diverse (academic disciplines, stakeholder roles, methodological lenses)
- Questions should be specific and researchable
- Include at least one skeptical/contrarian perspective
- Include one methodological perspective`,
        },
        {
          role: 'user',
          content: `Query: "${query}"

Generate perspectives and questions:`,
        },
      ],
      temperature: 0.4,
      jsonMode: true,
      maxTokens: 1200,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ perspectives: StormPerspective[] }>(response.content);
    if (parsed?.perspectives) {
      return { perspectives: parsed.perspectives, costUsd: response.costUsd };
    }
  } catch (err) {
    console.warn('[STORM] perspective generation failed:', err);
  }

  // Fallback: generic perspectives
  return {
    perspectives: [
      { name: 'Mainstream expert', description: 'Standard position in the field', questions: [`What is the consensus on ${query}?`, `What evidence supports this?`] },
      { name: 'Skeptic', description: 'Critical perspective', questions: [`What are the main critiques of ${query}?`, `What are the limitations?`] },
      { name: 'Policymaker', description: 'Policy implications', questions: [`What policy actions follow from this?`, `What are the implementation challenges?`] },
    ],
    costUsd: 0,
  };
}

/**
 * Build an outline from STORM perspectives.
 * This becomes the search plan for the Intelligent Scout.
 */
export async function buildStormOutline(
  query: string,
  config: ResearchPatternsConfig = DEFAULT_RESEARCH_PATTERNS_CONFIG,
): Promise<StormOutline> {
  const { perspectives, costUsd: perspectiveCost } = await generateStormPerspectives(query, config);

  const allQuestions = perspectives.flatMap(p => p.questions);

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `Given research perspectives and questions, synthesize a report outline and a set of key research questions.

Output JSON:
{
  "questions": ["most important questions to answer"],
  "sections": ["section 1 title", "section 2 title", ...]
}

The questions should cover the most important gaps. The sections should form a coherent report.`,
        },
        {
          role: 'user',
          content: `Query: "${query}"

Perspectives and questions:
${perspectives.map(p => `## ${p.name}\n${p.questions.map(q => `- ${q}`).join('\n')}`).join('\n\n')}

Generate outline:`,
        },
      ],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 600,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ questions: string[]; sections: string[] }>(response.content);
    if (parsed) {
      return {
        query,
        perspectives,
        questions: parsed.questions,
        sections: parsed.sections,
        costUsd: perspectiveCost + response.costUsd,
      };
    }
  } catch (err) {
    console.warn('[STORM] outline generation failed:', err);
  }

  return {
    query,
    perspectives,
    questions: allQuestions,
    sections: ['Introduction', 'Background', 'Main Findings', 'Contradictions', 'Conclusion'],
    costUsd: perspectiveCost,
  };
}

// ─── PaperQA2: Citation Traversal ───────────────────────────────────────────

/**
 * Parse references from a source's full text or metadata.
 * In production, this would use Grobid or a PDF parser. Here we use an LLM to extract references.
 */
export async function extractReferences(
  sourceId: string,
  sourceText: string,
  maxReferences: number,
): Promise<CitationTraversalResult['references']> {
  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `Extract the references/bibliography from this academic text. For each reference, extract title, authors, year, and DOI if present.

Output JSON:
{
  "references": [
    {"title": "...", "authors": ["..."], "year": 2024, "doi": "...", "source": "..."}
  ]
}

Limit to ${maxReferences} most relevant references.`,
        },
        {
          role: 'user',
          content: `${sourceText.slice(0, 8000)}`,
        },
      ],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 1200,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ references: CitationTraversalResult['references'] }>(response.content);
    if (parsed?.references) {
      return parsed.references;
    }
  } catch (err) {
    console.warn('[CitationTraversal] extraction failed:', err);
  }

  return [];
}

/**
 * Score references for relevance to the query.
 */
export async function scoreReferencesForRelevance(
  query: string,
  references: CitationTraversalResult['references'],
  config: ResearchPatternsConfig = DEFAULT_RESEARCH_PATTERNS_CONFIG,
): Promise<CitationTraversalResult> {
  if (references.length === 0) {
    return {
      sourceId: '',
      references: [],
      relevantReferences: [],
      followUpQueries: [],
      costUsd: 0,
    };
  }

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `Given a research query and a list of references, identify which are most relevant and what follow-up search queries they suggest.

Output JSON:
{
  "relevantReferences": [
    {"title": "...", "reason": "why this is relevant"}
  ],
  "followUpQueries": ["query 1", "query 2"]
}

Only keep references with a clear relevance to the query.`,
        },
        {
          role: 'user',
          content: `Query: "${query}"

References:
${references.map((r, i) => `${i + 1}. "${r.title}" (${r.year}) ${r.authors.join(', ')}`).join('\n')}`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 800,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ relevantReferences: CitationTraversalResult['relevantReferences']; followUpQueries: string[] }>(response.content);
    if (parsed) {
      return {
        sourceId: '',
        references,
        relevantReferences: parsed.relevantReferences,
        followUpQueries: parsed.followUpQueries,
        costUsd: response.costUsd,
      };
    }
  } catch (err) {
    console.warn('[CitationTraversal] relevance scoring failed:', err);
  }

  return {
    sourceId: '',
    references,
    relevantReferences: [],
    followUpQueries: [],
    costUsd: 0,
  };
}

/**
 * Traverse citations for a list of top sources.
 * Returns new search queries to expand the research.
 */
export async function traverseCitations(
  query: string,
  topSources: Array<{ id: string; content?: string }>,
  config: ResearchPatternsConfig = DEFAULT_RESEARCH_PATTERNS_CONFIG,
): Promise<{
  results: Array<CitationTraversalResult & { sourceId: string }>;
  allFollowUpQueries: string[];
  totalCost: number;
}> {
  const results: Array<CitationTraversalResult & { sourceId: string }> = [];
  let totalCost = 0;
  const allQueries = new Set<string>();

  for (const source of topSources.slice(0, 5)) { // Limit to top 5 sources
    try {
      const content = source.content || source.id;
      const references = await extractReferences(source.id, content, config.maxReferences);
      const scored = await scoreReferencesForRelevance(query, references, config);

      results.push({
        sourceId: source.id,
        references: scored.references,
        relevantReferences: scored.relevantReferences,
        followUpQueries: scored.followUpQueries,
        costUsd: scored.costUsd,
      });

      totalCost += scored.costUsd;
      for (const q of scored.followUpQueries) allQueries.add(q);
    } catch (err) {
      console.warn(`[CitationTraversal] failed for source ${source.id}:`, err);
    }
  }

  return {
    results,
    allFollowUpQueries: Array.from(allQueries),
    totalCost,
  };
}

// ─── Combined: STORM + Citation Traversal Search Plan ───────────────────────

/**
 * Build a complete search plan from STORM + citation traversal.
 *
 * @param query - The main research query
 * @param searchFn - Search function for top sources
 * @param readFn - Function to read source content
 * @param config - Config
 * @returns The expanded search plan
 */
export async function buildResearchSearchPlan(
  query: string,
  searchFn: (query: string) => Promise<{ sourceIds: string[] }>,
  readFn: (sourceId: string) => Promise<string>,
  config: ResearchPatternsConfig = DEFAULT_RESEARCH_PATTERNS_CONFIG,
): Promise<{
  outline: StormOutline;
  searchQueries: string[];
  followUpFromCitations: string[];
  totalCost: number;
}> {
  let totalCost = 0;

  // Step 1: STORM outline
  const outline = await buildStormOutline(query, config);
  totalCost += outline.costUsd;

  // Step 2: Initial search for top sources
  const initialSearch = await searchFn(query);
  const topSources = initialSearch.sourceIds.slice(0, 5);

  // Step 3: Citation traversal
  let followUp: string[] = [];
  if (config.enableCitationTraversal) {
    const sourceContents = await Promise.allSettled(
      topSources.map(id => readFn(id))
    );
    const sources = topSources.map((id, i) => ({
      id,
      content: sourceContents[i].status === 'fulfilled' ? (sourceContents[i] as PromiseFulfilledResult<string>).value : undefined,
    }));

    const traversal = await traverseCitations(query, sources, config);
    followUp = traversal.allFollowUpQueries;
    totalCost += traversal.totalCost;
  }

  // Combine STORM questions + follow-up queries
  const searchQueries = [...outline.questions, ...followUp];

  return {
    outline,
    searchQueries,
    followUpFromCitations: followUp,
    totalCost,
  };
}
