/**
 * NomosX Contradiction Detector Agent
 * 
 * Detects contradictions between sources on the same topic.
 * Key differentiator for a real think tank.
 * 
 * Process:
 * 1. Group sources by topic/vertical
 * 2. Extract claims from each source
 * 3. Compare claims using LLM to detect contradictions
 * 4. Generate CONTRADICTION signals when found
 */

import { prisma } from '@/lib/db';
import { callLLM } from '@/lib/llm/unified-llm';
import { AgentRole,assertPermission } from '@/lib/governance/index';
import { embedText } from './semantic-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface ContradictionResult {
  sourceId1: string;
  sourceId2: string;
  claim1: string;
  claim2: string;
  contradictionType: "direct" | "methodological" | "contextual";
  confidence: number; // 0-100
  explanation: string;
}

export interface ContradictionDetectorOutput {
  analyzed: number;
  contradictionsFound: number;
  contradictions: ContradictionResult[];
}

// ============================================================================
// MAIN DETECTOR
// ============================================================================

export async function contradictionDetector(
  sourceIds: string[],
  options?: {
    minQuality?: number;
    topicFilter?: string;
  }
): Promise<ContradictionDetectorOutput> {
  assertPermission(AgentRole.READER, "write:claims");
  
  console.log(`[CONTRADICTION_DETECTOR] Analyzing ${sourceIds.length} sources for contradictions...`);
  
  // Fetch sources with claims
  const sources = await prisma.source.findMany({
    where: {
      id: { in: sourceIds },
      qualityScore: { gte: options?.minQuality ?? 70 },
      abstract: { not: null }
    },
    select: {
      id: true,
      title: true,
      abstract: true,
      year: true,
      provider: true,
      qualityScore: true,
      topics: true
    }
  });
  
  if (sources.length < 2) {
    console.log(`[CONTRADICTION_DETECTOR] Need at least 2 sources to detect contradictions`);
    return { analyzed: sources.length, contradictionsFound: 0, contradictions: [] };
  }
  
  console.log(`[CONTRADICTION_DETECTOR] ${sources.length} sources qualify for analysis`);
  
  // Group sources by topic similarity (simple approach: shared topics)
  const sourceGroups = groupByTopic(sources);
  const contradictions: ContradictionResult[] = [];
  
  for (const [topic, groupSources] of sourceGroups) {
    if (groupSources.length < 2) continue;
    
    console.log(`[CONTRADICTION_DETECTOR] Analyzing topic "${topic}" with ${groupSources.length} sources`);
    
    // Compare pairs within the group (limit to avoid explosion)
    const pairs = generatePairs(groupSources, 10); // Max 10 pairs per topic
    
    for (const [source1, source2] of pairs) {
      const result = await detectContradiction(source1, source2);
      if (result && result.confidence >= 70) {
        contradictions.push(result);
        console.log(`[CONTRADICTION_DETECTOR] ⚠️ Found ${result.contradictionType} contradiction (${result.confidence}%)`);
      }
    }
  }
  
  console.log(`[CONTRADICTION_DETECTOR] Found ${contradictions.length} contradictions`);
  
  // Store contradictions in database + Knowledge Graph (P1-E)
  for (const contradiction of contradictions) {
    await prisma.contradiction.create({
      data: {
        sourceId1: contradiction.sourceId1,
        sourceId2: contradiction.sourceId2,
        claim1: contradiction.claim1,
        claim2: contradiction.claim2,
        contradictionType: contradiction.contradictionType,
        confidence: contradiction.confidence,
        explanation: contradiction.explanation,
        status: "NEW"
      }
    });

    // P1-E: Persist contradiction as ConceptRelation in Knowledge Graph
    // This allows future Context Primer to surface known contradictions
    storeContradictionInKG(contradiction).catch(err =>
      console.warn(`[CONTRADICTION_DETECTOR] KG store failed (non-blocking):`, err)
    );
  }
  
  return {
    analyzed: sources.length,
    contradictionsFound: contradictions.length,
    contradictions
  };
}

// ============================================================================
// P1-E: KNOWLEDGE GRAPH PERSISTENCE
// ============================================================================

async function storeContradictionInKG(contradiction: ContradictionResult): Promise<void> {
  try {
    // Embed both claims to create concept nodes
    const [emb1, emb2] = await Promise.all([
      embedText(contradiction.claim1.slice(0, 500)),
      embedText(contradiction.claim2.slice(0, 500)),
    ]);

    // Upsert concept node for claim 1
    const node1 = await prisma.conceptNode.upsert({
      where: { id: `contradiction-${contradiction.sourceId1}-${contradiction.claim1.slice(0, 50).replace(/\s+/g, '-')}` },
      create: {
        id: `contradiction-${contradiction.sourceId1}-${contradiction.claim1.slice(0, 50).replace(/\s+/g, '-')}`,
        name: contradiction.claim1.slice(0, 200),
        type: "claim",
        description: contradiction.claim1.slice(0, 500),
        briefIds: { set: [contradiction.sourceId1] },
        embedding: emb1,
        confidence: contradiction.confidence,
        occurrenceCount: 1,
        lastSeen: new Date(),
      },
      update: { occurrenceCount: { increment: 1 }, lastSeen: new Date() },
    });

    // Upsert concept node for claim 2
    const node2 = await prisma.conceptNode.upsert({
      where: { id: `contradiction-${contradiction.sourceId2}-${contradiction.claim2.slice(0, 50).replace(/\s+/g, '-')}` },
      create: {
        id: `contradiction-${contradiction.sourceId2}-${contradiction.claim2.slice(0, 50).replace(/\s+/g, '-')}`,
        name: contradiction.claim2.slice(0, 200),
        type: "claim",
        description: contradiction.claim2.slice(0, 500),
        briefIds: { set: [contradiction.sourceId2] },
        embedding: emb2,
        confidence: contradiction.confidence,
        occurrenceCount: 1,
        lastSeen: new Date(),
      },
      update: { occurrenceCount: { increment: 1 }, lastSeen: new Date() },
    });

    // Create contradicts relation between the two nodes
    await prisma.conceptRelation.upsert({
      where: { fromConceptId_toConceptId_type: { fromConceptId: node1.id, toConceptId: node2.id, type: "contradicts" } },
      create: {
        fromConceptId: node1.id,
        toConceptId: node2.id,
        type: "contradicts",
        strength: contradiction.confidence / 100,
        evidence: { set: [contradiction.explanation.slice(0, 500)] },
      },
      update: { strength: contradiction.confidence / 100, evidence: { set: [contradiction.explanation.slice(0, 500)] } },
    });

    console.log(`[CONTRADICTION_DETECTOR] KG: stored contradiction relation (${contradiction.contradictionType}, ${contradiction.confidence}%)`);
  } catch (err) {
    // Non-fatal — KG storage is best-effort
    console.warn(`[CONTRADICTION_DETECTOR] KG persistence failed:`, err);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function groupByTopic(sources: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  
  for (const source of sources) {
    const topics = source.topics || [];
    
    // Use first topic as primary grouping key
    const primaryTopic = topics[0] || "general";
    
    if (!groups.has(primaryTopic)) {
      groups.set(primaryTopic, []);
    }
    groups.get(primaryTopic)!.push(source);
  }
  
  return groups;
}

function generatePairs(sources: any[], maxPairs: number): [any, any][] {
  const pairs: [any, any][] = [];
  
  for (let i = 0; i < sources.length && pairs.length < maxPairs; i++) {
    for (let j = i + 1; j < sources.length && pairs.length < maxPairs; j++) {
      pairs.push([sources[i], sources[j]]);
    }
  }
  
  return pairs;
}

async function detectContradiction(
  source1: any,
  source2: any
): Promise<ContradictionResult | null> {
  const prompt = `You are a research analyst detecting contradictions between academic sources.

SOURCE 1:
Title: ${source1.title}
Year: ${source1.year || "N/A"}
Provider: ${source1.provider}
Abstract: ${(source1.abstract || "").slice(0, 1500)}

SOURCE 2:
Title: ${source2.title}
Year: ${source2.year || "N/A"}
Provider: ${source2.provider}
Abstract: ${(source2.abstract || "").slice(0, 1500)}

TASK: Analyze if these sources contain contradictory claims or findings.

Return JSON:
{
  "hasContradiction": boolean,
  "contradictionType": "direct" | "methodological" | "contextual" | null,
  "claim1": "specific claim from source 1 (if contradiction)",
  "claim2": "contradicting claim from source 2 (if contradiction)",
  "confidence": 0-100,
  "explanation": "why these claims contradict (be specific)"
}

Types:
- direct: Opposite conclusions on same question
- methodological: Different methods leading to different results
- contextual: True in different contexts/populations

Only report REAL contradictions with confidence ≥ 70. Do NOT flag:
- Different topics
- Complementary findings
- Updates/refinements of previous work`;

  try {
    const response = await callLLM({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 1000,
      enableCache: true
    });
    
    const result = JSON.parse(response.content);
    
    if (!result.hasContradiction || result.confidence < 70) {
      return null;
    }
    
    return {
      sourceId1: source1.id,
      sourceId2: source2.id,
      claim1: result.claim1 || "",
      claim2: result.claim2 || "",
      contradictionType: result.contradictionType || "direct",
      confidence: result.confidence || 0,
      explanation: result.explanation || ""
    };
  } catch (error) {
    console.warn(`[CONTRADICTION_DETECTOR] Error comparing sources: ${error}`);
    return null;
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

export async function detectContradictionsInRecent(
  days: number = 7,
  verticalSlug?: string
): Promise<ContradictionDetectorOutput> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const whereClause: any = {
    createdAt: { gte: since },
    qualityScore: { gte: 70 }
  };
  
  const sources = await prisma.source.findMany({
    where: whereClause,
    select: { id: true },
    take: 100 // Limit for performance
  });
  
  const sourceIds = sources.map(s => s.id);
  
  return contradictionDetector(sourceIds);
}
