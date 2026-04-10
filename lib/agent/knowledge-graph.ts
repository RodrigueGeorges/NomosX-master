/**
 * NomosX KNOWLEDGE GRAPH — Concept Store & Longitudinal Memory
 * 
 * A pgvector-backed concept store that tracks knowledge across briefs:
 * 
 * 1. Extracts key concepts from each analysis (entities, claims, relationships)
 * 2. Stores concept embeddings for semantic retrieval
 * 3. Links concepts to sources, briefs, and other concepts
 * 4. Tracks concept evolution over time (longitudinal tracking)
 * 5. Detects emerging themes and shifting consensus
 * 6. Provides "institutional memory" — the system remembers what it has learned
 * 
 * This is what makes NomosX a persistent think tank, not a stateless tool.
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { AgentRole, assertPermission } from '../governance/index';
import { embedText, embedBatch, cosineSimilarity } from './semantic-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface Concept {
  id?: string;
  name: string;
  type: ConceptType;
  description: string;
  embedding?: number[];
  confidence: number;          // 0-100
  firstSeen: Date;
  lastSeen: Date;
  occurrenceCount: number;
  sourceIds: string[];
  briefIds: string[];
  relatedConcepts: string[];   // Concept IDs
  metadata: Record<string, any>;
}

export type ConceptType =
  | "entity"          // Named entity (person, org, place)
  | "claim"           // Factual assertion
  | "theory"          // Theoretical framework
  | "method"          // Research methodology
  | "finding"         // Empirical finding
  | "policy"          // Policy recommendation
  | "trend"           // Emerging trend
  | "controversy";    // Active debate

export interface ConceptRelation {
  fromConceptId: string;
  toConceptId: string;
  type: RelationType;
  strength: number;            // 0-1
  evidence: string[];          // Source IDs supporting this relation
}

export type RelationType =
  | "supports"
  | "contradicts"
  | "extends"
  | "precedes"
  | "causes"
  | "correlates"
  | "part_of"
  | "instance_of";

export interface ConceptExtractionResult {
  concepts: Concept[];
  relations: ConceptRelation[];
  costUsd: number;
}

export interface KnowledgeQueryResult {
  concepts: Array<Concept & { similarity: number }>;
  relatedBriefs: string[];
  timeline: Array<{ date: Date; event: string; conceptId: string }>;
}

export interface LongitudinalInsight {
  concept: string;
  trend: "emerging" | "stable" | "declining" | "contested";
  confidenceTrajectory: number[];  // Over time
  briefCount: number;
  firstMention: Date;
  latestMention: Date;
  summary: string;
}

// ============================================================================
// CONCEPT EXTRACTION
// ============================================================================

/**
 * Extract concepts from an analysis output and store them in the knowledge graph.
 */
export async function extractAndStoreConcepts(
  briefId: string,
  question: string,
  analysisText: string,
  sourceIds: string[]
): Promise<ConceptExtractionResult> {
  assertPermission(AgentRole.ANALYST, "write:analysis");
  console.log(`[KNOWLEDGE] Extracting concepts from brief ${briefId}`);

  let costUsd = 0;

  // ── STEP 1: LLM extraction ──
  const extractResponse = await callLLM({
    messages: [{
      role: "system",
      content: `You are a knowledge engineer extracting structured concepts from research analysis. Extract the most important entities, claims, theories, methods, findings, policies, trends, and controversies. Be precise and avoid duplicates.`
    }, {
      role: "user",
      content: `RESEARCH QUESTION: ${question}

ANALYSIS (first 4000 chars):
${analysisText.slice(0, 4000)}

Extract key concepts and their relationships. For each concept provide:
- name: Short canonical name
- type: entity|claim|theory|method|finding|policy|trend|controversy
- description: 1-2 sentence description
- confidence: 0-100 (how well-supported by evidence)

For relationships between concepts:
- type: supports|contradicts|extends|precedes|causes|correlates|part_of|instance_of
- strength: 0-1

Return JSON:
{
  "concepts": [
    { "name": "...", "type": "...", "description": "...", "confidence": 80 }
  ],
  "relations": [
    { "from": "concept name 1", "to": "concept name 2", "type": "supports", "strength": 0.8 }
  ]
}`
    }],
    temperature: 0.15,
    jsonMode: true,
    maxTokens: 3000,
    enableCache: true,
  });

  costUsd += extractResponse.costUsd;
  const extracted = JSON.parse(extractResponse.content);

  // ── STEP 2: Embed concept descriptions ──
  const descriptions = (extracted.concepts || []).map((c: any) => `${c.name}: ${c.description}`);
  let embeddings: number[][] = [];
  try {
    if (descriptions.length > 0) {
      embeddings = await embedBatch(descriptions);
    }
  } catch (err) {
    console.warn(`[KNOWLEDGE] Embedding failed (continuing without):`, err);
  }

  // ── STEP 3: Deduplicate against existing concepts ──
  const now = new Date();
  const concepts: Concept[] = [];

  for (let i = 0; i < (extracted.concepts || []).length; i++) {
    const raw = extracted.concepts[i];
    const embedding = embeddings[i] || undefined;

    // Check for existing similar concept
    let existingConcept: any = null;
    if (embedding) {
      existingConcept = await findSimilarConcept(raw.name, embedding, 0.85);
    }

    if (existingConcept) {
      // Update existing concept
      // Prisma push on String[] only accepts a single value, not an array.
      // Merge existing + new sourceIds and deduplicate.
      const existingSourceIds = (existingConcept.sourceIds as string[]) || [];
      const existingBriefIds = (existingConcept.briefIds as string[]) || [];
      const mergedSourceIds = [...new Set([...existingSourceIds, ...sourceIds])];
      const mergedBriefIds = [...new Set([...existingBriefIds, briefId])];

      const updated = await prisma.conceptNode.update({
        where: { id: existingConcept.id },
        data: {
          lastSeen: now,
          occurrenceCount: { increment: 1 },
          sourceIds: { set: mergedSourceIds },
          briefIds: { set: mergedBriefIds },
          confidence: Math.round((existingConcept.confidence + (raw.confidence || 70)) / 2),
        },
      });
      concepts.push(mapPrismaToConcept(updated));
      console.log(`[KNOWLEDGE] Updated existing concept: "${raw.name}" (${updated.occurrenceCount} occurrences)`);
    } else {
      // Create new concept
      try {
        const created = await prisma.conceptNode.create({
          data: {
            name: raw.name,
            type: raw.type || "finding",
            description: raw.description || "",
            embedding: embedding || [],
            confidence: raw.confidence || 70,
            firstSeen: now,
            lastSeen: now,
            occurrenceCount: 1,
            sourceIds: sourceIds,
            briefIds: [briefId],
            relatedConcepts: [],
            metadata: {},
          },
        });
        concepts.push(mapPrismaToConcept(created));
        console.log(`[KNOWLEDGE] Created new concept: "${raw.name}" (${raw.type})`);
      } catch (err) {
        console.warn(`[KNOWLEDGE] Failed to create concept "${raw.name}":`, err);
      }
    }
  }

  // ── STEP 4: Store relations ──
  const relations: ConceptRelation[] = [];
  for (const rel of (extracted.relations || [])) {
    const fromConcept = concepts.find(c => c.name === rel.from);
    const toConcept = concepts.find(c => c.name === rel.to);
    if (fromConcept?.id && toConcept?.id) {
      try {
        await prisma.conceptRelation.upsert({
          where: {
            fromConceptId_toConceptId_type: {
              fromConceptId: fromConcept.id,
              toConceptId: toConcept.id,
              type: rel.type,
            },
          },
          update: {
            strength: rel.strength || 0.5,
            evidence: { push: sourceIds },
          },
          create: {
            fromConceptId: fromConcept.id,
            toConceptId: toConcept.id,
            type: rel.type,
            strength: rel.strength || 0.5,
            evidence: sourceIds,
          },
        });
        relations.push({
          fromConceptId: fromConcept.id,
          toConceptId: toConcept.id,
          type: rel.type,
          strength: rel.strength || 0.5,
          evidence: sourceIds,
        });
      } catch (err) {
        console.warn(`[KNOWLEDGE] Failed to store relation ${rel.from} → ${rel.to}:`, err);
      }
    }
  }

  console.log(`[KNOWLEDGE] ✅ Extracted ${concepts.length} concepts, ${relations.length} relations, cost=$${costUsd.toFixed(4)}`);

  return { concepts, relations, costUsd };
}

// ============================================================================
// SEMANTIC QUERY
// ============================================================================

/**
 * Query the knowledge graph semantically.
 */
export async function queryKnowledgeGraph(
  query: string,
  options: { limit?: number; minSimilarity?: number; types?: ConceptType[] } = {}
): Promise<KnowledgeQueryResult> {
  const { limit = 20, minSimilarity = 0.6, types } = options;

  console.log(`[KNOWLEDGE] Querying: "${query.slice(0, 60)}..."`);

  // Embed query
  const queryEmbedding = await embedText(query);

  // Fetch all concepts (with optional type filter)
  const where: any = {};
  if (types?.length) {
    where.type = { in: types };
  }

  const allConcepts = await prisma.conceptNode.findMany({
    where,
    orderBy: { occurrenceCount: "desc" },
    take: 500, // Cap for performance
  });

  // Compute similarities
  const scored = allConcepts
    .map(c => ({
      ...mapPrismaToConcept(c),
      similarity: c.embedding?.length ? cosineSimilarity(queryEmbedding, c.embedding as number[]) : 0,
    }))
    .filter(c => c.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  // Collect related briefs
  const relatedBriefs = [...new Set(scored.flatMap(c => c.briefIds))];

  // Build timeline
  const timeline = scored.map(c => ({
    date: c.firstSeen,
    event: `First mention of "${c.name}" (${c.type})`,
    conceptId: c.id || "",
  })).sort((a, b) => a.date.getTime() - b.date.getTime());

  console.log(`[KNOWLEDGE] Found ${scored.length} relevant concepts across ${relatedBriefs.length} briefs`);

  return { concepts: scored, relatedBriefs, timeline };
}

// ============================================================================
// LONGITUDINAL TRACKING
// ============================================================================

/**
 * Analyze how concepts have evolved over time.
 */
export async function getLongitudinalInsights(
  options: { minOccurrences?: number; types?: ConceptType[]; limit?: number } = {}
): Promise<LongitudinalInsight[]> {
  const { minOccurrences = 2, types, limit = 20 } = options;

  const where: any = { occurrenceCount: { gte: minOccurrences } };
  if (types?.length) where.type = { in: types };

  const concepts = await prisma.conceptNode.findMany({
    where,
    orderBy: { occurrenceCount: "desc" },
    take: limit,
  });

  const insights: LongitudinalInsight[] = concepts.map(c => {
    const daysSinceFirst = (Date.now() - new Date(c.firstSeen).getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceLast = (Date.now() - new Date(c.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
    const velocity = c.occurrenceCount / Math.max(daysSinceFirst, 1);

    let trend: LongitudinalInsight["trend"];
    if (daysSinceLast > 30 && velocity < 0.05) {
      trend = "declining";
    } else if (velocity > 0.3) {
      trend = "emerging";
    } else if (c.confidence < 50) {
      trend = "contested";
    } else {
      trend = "stable";
    }

    return {
      concept: c.name,
      trend,
      confidenceTrajectory: [c.confidence], // Simplified — full history would need a separate table
      briefCount: (c.briefIds as string[])?.length || 0,
      firstMention: new Date(c.firstSeen),
      latestMention: new Date(c.lastSeen),
      summary: `"${c.name}" (${c.type}) — ${trend}, seen ${c.occurrenceCount} times across ${(c.briefIds as string[])?.length || 0} briefs, confidence ${c.confidence}%`,
    };
  });

  console.log(`[KNOWLEDGE] Longitudinal insights: ${insights.length} tracked concepts`);
  return insights;
}

// ============================================================================
// HELPERS
// ============================================================================

async function findSimilarConcept(
  name: string,
  embedding: number[],
  threshold: number
): Promise<any | null> {
  // First try exact name match
  const exactMatch = await prisma.conceptNode.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (exactMatch) return exactMatch;

  // Then try semantic similarity
  const candidates = await prisma.conceptNode.findMany({
    take: 50,
    orderBy: { occurrenceCount: "desc" },
  });

  for (const c of candidates) {
    if (c.embedding?.length) {
      const sim = cosineSimilarity(embedding, c.embedding as number[]);
      if (sim >= threshold) return c;
    }
  }

  return null;
}

function mapPrismaToConcept(row: any): Concept {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ConceptType,
    description: row.description || "",
    embedding: row.embedding as number[] | undefined,
    confidence: row.confidence || 0,
    firstSeen: new Date(row.firstSeen),
    lastSeen: new Date(row.lastSeen),
    occurrenceCount: row.occurrenceCount || 0,
    sourceIds: (row.sourceIds as string[]) || [],
    briefIds: (row.briefIds as string[]) || [],
    relatedConcepts: (row.relatedConcepts as string[]) || [],
    metadata: (row.metadata as Record<string, any>) || {},
  };
}
