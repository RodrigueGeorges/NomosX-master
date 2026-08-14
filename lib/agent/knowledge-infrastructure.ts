/**
 * NomosX Knowledge Graph + Experience Bank + Context Compression
 *
 * Three infrastructure innovations from 2026 research:
 *
 * 1. KNOWLEDGE GRAPH (Agents-K1, arxiv 2026):
 *    Converts papers into typed knowledge graphs with entities, claims,
 *    mechanisms, method lineages. Enables multi-hop reasoning.
 *
 * 2. EXPERIENCE BANK (TMAS, ICML 2026):
 *    Persistent memory of past analyses. Reusable conclusions, patterns,
 *    and guidelines that improve future runs.
 *
 * 3. CONTEXT COMPRESSION (IterResearch, ICLR 2026):
 *    Compresses intermediate findings to fit in context window.
 *    Enables 2048+ tool calls in 40k context.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── 1. Knowledge Graph Inter-Papers ────────────────────────────────────────

export interface KGEntity {
  id: string;
  name: string;
  type: 'method' | 'dataset' | 'metric' | 'concept' | 'organization' | 'person' | 'policy' | 'technology';
  aliases: string[];
  sourceIds: string[]; // Which sources mention this entity
}

export interface KGRelation {
  id: string;
  source: string; // Entity ID
  target: string; // Entity ID
  type: 'uses' | 'evaluates' | 'contradicts' | 'supports' | 'extends' | 'cites' | 'funds' | 'regulates' | 'measures';
  weight: number; // 0-1, confidence
  sourceId: string; // Which source this relation comes from
}

export interface KnowledgeGraph {
  entities: KGEntity[];
  relations: KGRelation[];
  clusters: Array<{ id: string; entityIds: string[]; label: string }>;
  bridges: Array<{ entityId: string; connectsClusters: string[] }>;
}

const KG_EXTRACTION_PROMPT = `You are a knowledge graph extractor. Extract entities and relations from research sources.

SOURCES:
{sources}

Extract:
1. ENTITIES: Methods, datasets, metrics, concepts, organizations, people, policies, technologies
2. RELATIONS: How entities relate to each other (uses, evaluates, contradicts, supports, extends, cites, funds, regulates, measures)

Return JSON:
{
  "entities": [
    {
      "id": "e1",
      "name": "Carbon Tax",
      "type": "policy",
      "aliases": ["carbon pricing", "CO2 tax"],
      "sourceIds": ["src1", "src3"]
    }
  ],
  "relations": [
    {
      "id": "r1",
      "source": "e1",
      "target": "e2",
      "type": "measures",
      "weight": 0.9,
      "sourceId": "src1"
    }
  ]
}

Rules:
- Merge entities that refer to the same thing (use aliases)
- Only extract relations that are explicitly stated in the sources
- Weight = confidence in the relation (0-1)`;

/**
 * Build a knowledge graph from a set of sources.
 * Extracts entities and relations using LLM, then detects clusters and bridges.
 */
export async function buildKnowledgeGraph(
  sources: Array<{ id: string; title: string; abstract: string }>,
): Promise<{ graph: KnowledgeGraph; costUsd: number }> {
  if (sources.length === 0) {
    return { graph: { entities: [], relations: [], clusters: [], bridges: [] }, costUsd: 0 };
  }

  try {
    // Process in batches of 10 sources
    const BATCH = 10;
    const allEntities: KGEntity[] = [];
    const allRelations: KGRelation[] = [];
    let totalCost = 0;

    for (let i = 0; i < sources.length; i += BATCH) {
      const batch = sources.slice(i, i + BATCH);
      const sourcesJson = JSON.stringify(batch.map(s => ({ id: s.id, title: s.title, abstract: s.abstract.slice(0, 500) })));

      const response = await callLLM({
        messages: [{ role: 'user', content: KG_EXTRACTION_PROMPT.replace('{sources}', sourcesJson) }],
        temperature: 0.1,
        jsonMode: true,
        maxTokens: 3000,
        task: 'reader_v3',
        enableCache: true,
      });
      totalCost += response.costUsd || 0;

      const result = parseJson<{ entities: KGEntity[]; relations: KGRelation[] }>(response.content);
      if (result?.entities) allEntities.push(...result.entities);
      if (result?.relations) allRelations.push(...result.relations);
    }

    // Merge duplicate entities (by name similarity)
    const mergedEntities = mergeEntities(allEntities);
    const mergedRelations = mergeRelations(allRelations, allEntities, mergedEntities);

    // Detect clusters (groups of densely connected entities)
    const clusters = detectKGClusters(mergedEntities, mergedRelations);

    // Detect bridges (entities that connect multiple clusters)
    const bridges = detectKGBridges(mergedEntities, clusters);

    console.log(`[KG] Built graph: ${mergedEntities.length} entities, ${mergedRelations.length} relations, ${clusters.length} clusters, ${bridges.length} bridges`);

    return {
      graph: { entities: mergedEntities, relations: mergedRelations, clusters, bridges },
      costUsd: totalCost,
    };
  } catch (err) {
    console.warn('[KG] Build failed:', String(err).slice(0, 80));
    return { graph: { entities: [], relations: [], clusters: [], bridges: [] }, costUsd: 0 };
  }
}

function mergeEntities(entities: KGEntity[]): KGEntity[] {
  const merged: KGEntity[] = [];
  const seen = new Map<string, KGEntity>();

  for (const entity of entities) {
    const key = entity.name.toLowerCase().trim();
    const existing = seen.get(key);
    if (existing) {
      // Merge aliases and source IDs
      existing.aliases = [...new Set([...existing.aliases, ...entity.aliases])];
      existing.sourceIds = [...new Set([...existing.sourceIds, ...entity.sourceIds])];
    } else {
      seen.set(key, { ...entity });
      merged.push({ ...entity });
    }
  }

  return merged;
}

function mergeRelations(
  relations: KGRelation[],
  originalEntities: KGEntity[],
  mergedEntities: KGEntity[],
): KGRelation[] {
  // Simple dedup by source+target+type
  const seen = new Set<string>();
  return relations.filter(r => {
    const key = `${r.source}|${r.target}|${r.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectKGClusters(entities: KGEntity[], relations: KGRelation[]): Array<{ id: string; entityIds: string[]; label: string }> {
  // Simple clustering: group entities by type
  const byType = new Map<string, string[]>();
  for (const e of entities) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push(e.id);
  }

  return Array.from(byType.entries()).map(([type, ids], i) => ({
    id: `cluster_${i}`,
    entityIds: ids,
    label: type,
  }));
}

function detectKGBridges(entities: KGEntity[], clusters: Array<{ id: string; entityIds: string[] }>): Array<{ entityId: string; connectsClusters: string[] }> {
  // Find entities that appear in multiple clusters' source IDs
  const entityClusters = new Map<string, Set<string>>();
  for (const cluster of clusters) {
    for (const entityId of cluster.entityIds) {
      if (!entityClusters.has(entityId)) entityClusters.set(entityId, new Set());
      entityClusters.get(entityId)!.add(cluster.id);
    }
  }

  const bridges: Array<{ entityId: string; connectsClusters: string[] }> = [];
  for (const [entityId, clusterIds] of entityClusters) {
    if (clusterIds.size >= 2) {
      bridges.push({ entityId, connectsClusters: Array.from(clusterIds) });
    }
  }

  return bridges;
}

// ─── 2. Experience Bank ─────────────────────────────────────────────────────

export interface ExperienceEntry {
  id: string;
  topic: string;
  question: string;
  phase: string;
  insight: string;
  pattern: string; // Reusable pattern
  successMetric?: number;
  timestamp: number;
}

export interface GuidelineEntry {
  id: string;
  topic: string;
  guideline: string;
  rationale: string;
  timestamp: number;
}

// In-memory experience bank (in production, this would be persisted to DB)
const experienceBank: ExperienceEntry[] = [];
const guidelineBank: GuidelineEntry[] = [];
const MAX_BANK_SIZE = 200;

export function recordExperience(
  topic: string,
  question: string,
  phase: string,
  insight: string,
  pattern: string,
  successMetric?: number,
): void {
  experienceBank.push({
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    topic,
    question,
    phase,
    insight,
    pattern,
    successMetric,
    timestamp: Date.now(),
  });
  if (experienceBank.length > MAX_BANK_SIZE) {
    experienceBank.splice(0, experienceBank.length - MAX_BANK_SIZE);
  }
}

export function recordGuideline(topic: string, guideline: string, rationale: string): void {
  guidelineBank.push({
    id: `guide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    topic,
    guideline,
    rationale,
    timestamp: Date.now(),
  });
  if (guidelineBank.length > MAX_BANK_SIZE) {
    guidelineBank.splice(0, guidelineBank.length - MAX_BANK_SIZE);
  }
}

export function getRelevantExperience(topic: string, phase: string): ExperienceEntry[] {
  return experienceBank.filter(e => {
    if (e.phase !== phase) return false;
    // Simple topic matching (in production, use embeddings)
    return e.topic.toLowerCase().includes(topic.toLowerCase().slice(0, 20)) ||
           topic.toLowerCase().includes(e.topic.toLowerCase().slice(0, 20));
  }).slice(-5); // Most recent 5
}

export function getRelevantGuidelines(topic: string): GuidelineEntry[] {
  return guidelineBank.filter(g => {
    return g.topic.toLowerCase().includes(topic.toLowerCase().slice(0, 20)) ||
           topic.toLowerCase().includes(g.topic.toLowerCase().slice(0, 20));
  }).slice(-3);
}

/**
 * Extract experience and guidelines from a completed pipeline run.
 */
export async function extractExperience(
  topic: string,
  question: string,
  pipelineStats: any,
): Promise<{ costUsd: number }> {
  let totalCost = 0;

  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: `You are a meta-learner. Extract reusable experience and guidelines from a completed research pipeline run.

TOPIC: ${topic}
QUESTION: ${question}
PIPELINE STATS: ${JSON.stringify(pipelineStats).slice(0, 2000)}

Extract:
1. EXPERIENCES: What worked well? What didn't? What patterns emerged?
2. GUIDELINES: What rules should future runs follow for similar topics?

Return JSON:
{
  "experiences": [
    {
      "phase": "scout",
      "insight": "OpenAlex returned 400+ sources but most were off-topic",
      "pattern": "For policy topics, prefer Crossref + institutional providers over OpenAlex"
    }
  ],
  "guidelines": [
    {
      "guideline": "For controversial topics, always include contrarian lens",
      "rationale": "Without contrarian sources, analysis has confirmation bias"
    }
  ]
}`,
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 1500,
      task: 'reader_v3',
      enableCache: true,
    });
    totalCost += response.costUsd || 0;

    const result = parseJson<{ experiences: Array<{ phase: string; insight: string; pattern: string }>; guidelines: Array<{ guideline: string; rationale: string }> }>(response.content);

    if (result?.experiences) {
      for (const exp of result.experiences) {
        recordExperience(topic, question, exp.phase, exp.insight, exp.pattern);
      }
    }

    if (result?.guidelines) {
      for (const g of result.guidelines) {
        recordGuideline(topic, g.guideline, g.rationale);
      }
    }

    console.log(`[ExperienceBank] Extracted ${result?.experiences?.length || 0} experiences, ${result?.guidelines?.length || 0} guidelines`);
  } catch (err) {
    console.warn('[ExperienceBank] Extraction failed:', String(err).slice(0, 80));
  }

  return { costUsd: totalCost };
}

// ─── 3. Context Compression ─────────────────────────────────────────────────

const COMPRESSION_PROMPT = `You are a context compressor. Compress a set of research findings into a concise summary that preserves key information.

FINDINGS TO COMPRESS:
{findings}

TARGET LENGTH: {targetLength} words

Compress by:
1. Removing redundant information
2. Keeping only key claims, statistics, and citations
3. Preserving the structure (sections, headings)
4. Maintaining all citation tags [SRC-N]

Return the compressed text only (no JSON, no metadata).`;

/**
 * Compress intermediate findings to fit in context window.
 * This is the IterResearch pattern: compress between phases to enable
 * long-horizon pipelines within limited context.
 */
export async function compressContext(
  findings: string,
  targetLengthWords: number = 500,
): Promise<{ compressed: string; costUsd: number }> {
  // If already short enough, return as-is
  const currentWords = findings.split(/\s+/).length;
  if (currentWords <= targetLengthWords) {
    return { compressed: findings, costUsd: 0 };
  }

  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: COMPRESSION_PROMPT
          .replace('{findings}', findings.slice(0, 12000))
          .replace('{targetLength}', String(targetLengthWords)),
      }],
      temperature: 0.1,
      maxTokens: targetLengthWords * 2, // Tokens ≈ 1.5x words
      task: 'reader_v3',
      enableCache: true,
    });

    const compressed = response.content.trim();
    const compressedWords = compressed.split(/\s+/).length;
    console.log(`[ContextCompress] ${currentWords} → ${compressedWords} words (${Math.round((1 - compressedWords / currentWords) * 100)}% reduction)`);

    return { compressed, costUsd: response.costUsd || 0 };
  } catch (err) {
    console.warn('[ContextCompress] Failed:', String(err).slice(0, 80));
    // Fallback: simple truncation
    return { compressed: findings.slice(0, targetLengthWords * 6), costUsd: 0 };
  }
}

/**
 * Compress multiple readings into a single summary.
 */
export async function compressReadings(
  readings: Array<{ sourceId: string; claims: string[]; methods: string[]; results: string[]; limitations: string[] }>,
): Promise<{ compressed: string; costUsd: number }> {
  const readingsText = readings.map(r =>
    `Source ${r.sourceId}:\n` +
    `  Claims: ${r.claims.join('; ')}\n` +
    `  Methods: ${r.methods.join('; ')}\n` +
    `  Results: ${r.results.join('; ')}\n` +
    `  Limitations: ${r.limitations.join('; ')}`
  ).join('\n\n');

  return compressContext(readingsText, 800);
}
