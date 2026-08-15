/**
 * World Model — NomosX
 *
 * Le World Model est la mémoire persistante du système. Il accumule
 * la connaissance à travers les runs : quels domaines ont été explorés,
 * quelles sont les positions établies, quelles sont les controverses
 * actives, quelles sont les connexions inter-domaines.
 *
 * C'est le moat le plus durable : après des milliers de runs, le système
 * a une compréhension du monde que les concurrents ne peuvent pas
 * répliquer sans le même volume d'exploration.
 *
 * Inspiré de :
 * - World Models (Ha & Schmidhuber, 2018)
 * - Episodic + Semantic memory (cognitive science)
 * - Knowledge Graphs (Neo4j, Microsoft Academic Graph)
 * - "Memory-augmented LLMs" (2024-2026)
 *
 * Architecture :
 * 1. Domain Memory — per-domain knowledge accumulation
 * 2. Cross-Domain Connections — links between concepts across domains
 * 3. Controversy Tracker — tracks ongoing debates and their evolution
 * 4. Source Reliability Index — learns which sources are reliable
 * 5. Paradigm Tracker — tracks paradigm shifts and their dates
 *
 * Usage :
 * - Before a run: query the World Model for relevant prior knowledge
 * - During a run: update the World Model with new findings
 * - After a run: extract and persist new knowledge
 */

import { callLLM } from '../../llm/unified-llm';
import { parseJson } from '../json-utils';
import { prisma } from '../../db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DomainMemory {
  domain: string;
  /** Key concepts and their definitions */
  concepts: ConceptEntry[];
  /** Established positions (well-supported by evidence) */
  establishedPositions: PositionEntry[];
  /** Active controversies */
  controversies: ControversyEntry[];
  /** Key sources (reliable, frequently cited) */
  keySources: SourceEntry[];
  /** Paradigm shifts */
  paradigmShifts: ParadigmShiftEntry[];
  /** Last updated */
  updatedAt: number;
  /** Number of runs that contributed */
  runCount: number;
}

export interface ConceptEntry {
  concept: string;
  definition: string;
  relatedConcepts: string[];
  confidence: number;
  sourceRefs: string[];
}

export interface PositionEntry {
  position: string;
  evidence: string;
  confidence: number;
  sourceRefs: string[];
  /** When this position was established */
  establishedDate?: string;
}

export interface ControversyEntry {
  topic: string;
  positionA: { label: string; evidence: string; sourceRefs: string[] };
  positionB: { label: string; evidence: string; sourceRefs: string[] };
  /** Current state of the debate */
  state: 'active' | 'resolved' | 'dormant';
  /** Which position is currently better supported */
  currentLean?: 'A' | 'B' | 'neutral';
  lastUpdated: number;
}

export interface SourceEntry {
  sourceId: string;
  title: string;
  /** Reliability score (0-1), learned from past usage */
  reliability: number;
  /** How many times this source has been cited across runs */
  citationCount: number;
  /** Domains this source is relevant to */
  domains: string[];
}

export interface ParadigmShiftEntry {
  shift: string;
  /** What was the old paradigm */
  oldParadigm: string;
  /** What is the new paradigm */
  newParadigm: string;
  /** When the shift happened (approximate) */
  date: string;
  /** Which sources triggered the shift */
  triggerSources: string[];
}

export interface CrossDomainLink {
  conceptA: string;
  domainA: string;
  conceptB: string;
  domainB: string;
  /** How they're connected */
  connection: string;
  /** Strength of the connection (0-1) */
  strength: number;
  /** When this link was discovered */
  discoveredAt: number;
}

// ─── World Model Query ──────────────────────────────────────────────────────

/**
 * Query the World Model for prior knowledge relevant to a new query.
 * Returns a context block that can be injected into the pipeline.
 */
export async function queryWorldModel(query: string): Promise<{
  relevantDomains: string[];
  priorKnowledge: string;
  knownControversies: string[];
  reliableSources: string[];
  crossDomainLinks: CrossDomainLink[];
}> {
  // Identify domains from the query
  const domains = await identifyDomains(query);

  // Load domain memories
  const domainMemories: DomainMemory[] = [];
  for (const domain of domains) {
    const memory = await loadDomainMemory(domain);
    if (memory) domainMemories.push(memory);
  }

  // Find cross-domain links
  const crossDomainLinks = await findCrossDomainLinks(domains);

  // Build prior knowledge context
  const parts: string[] = [];

  for (const memory of domainMemories) {
    parts.push(`### Domain: ${memory.domain}`);

    if (memory.establishedPositions.length > 0) {
      parts.push('**Established positions:**');
      for (const pos of memory.establishedPositions.slice(0, 5)) {
        parts.push(`- ${pos.position} (confidence: ${pos.confidence.toFixed(2)})`);
      }
    }

    if (memory.controversies.length > 0) {
      parts.push('**Active controversies:**');
      for (const cont of memory.controversies.filter(c => c.state === 'active').slice(0, 3)) {
        parts.push(`- ${cont.topic}: ${cont.positionA.label} vs ${cont.positionB.label} (lean: ${cont.currentLean || 'neutral'})`);
      }
    }

    if (memory.paradigmShifts.length > 0) {
      parts.push('**Recent paradigm shifts:**');
      for (const shift of memory.paradigmShifts.slice(0, 2)) {
        parts.push(`- ${shift.shift} (${shift.date}): ${shift.oldParadigm} → ${shift.newParadigm}`);
      }
    }
  }

  if (crossDomainLinks.length > 0) {
    parts.push('### Cross-Domain Connections');
    for (const link of crossDomainLinks.slice(0, 5)) {
      parts.push(`- ${link.conceptA} (${link.domainA}) ↔ ${link.conceptB} (${link.domainB}): ${link.connection}`);
    }
  }

  const knownControversies = domainMemories.flatMap(m =>
    m.controversies.filter(c => c.state === 'active').map(c => c.topic)
  );

  const reliableSources = domainMemories.flatMap(m =>
    m.keySources.filter(s => s.reliability > 0.7).map(s => s.sourceId)
  );

  return {
    relevantDomains: domains,
    priorKnowledge: parts.length > 0 ? parts.join('\n') : '',
    knownControversies,
    reliableSources,
    crossDomainLinks,
  };
}

// ─── World Model Update ─────────────────────────────────────────────────────

/**
 * Update the World Model with findings from a completed run.
 * This is the accumulation step — the system learns from every run.
 */
export async function updateWorldModel(
  query: string,
  analysis: string,
  sources: Array<{ id: string; title: string; abstract?: string; provider?: string }>,
  domains: string[],
): Promise<void> {
  console.log(`[WorldModel] Updating with findings from "${query.slice(0, 60)}..."`);

  // Extract knowledge from the analysis
  const extraction = await extractKnowledge(query, analysis, sources);

  // Update each domain
  for (const domain of domains) {
    let memory = await loadDomainMemory(domain);
    if (!memory) {
      memory = {
        domain,
        concepts: [],
        establishedPositions: [],
        controversies: [],
        keySources: [],
        paradigmShifts: [],
        updatedAt: Date.now(),
        runCount: 0,
      };
    }

    memory.runCount++;

    // Merge new concepts
    for (const concept of extraction.concepts) {
      const existing = memory.concepts.find(c => c.concept === concept.concept);
      if (existing) {
        // Update: take the more confident definition
        if (concept.confidence > existing.confidence) {
          existing.definition = concept.definition;
          existing.confidence = concept.confidence;
        }
        existing.sourceRefs = [...new Set([...existing.sourceRefs, ...concept.sourceRefs])];
      } else {
        memory.concepts.push(concept);
      }
    }

    // Merge established positions
    for (const pos of extraction.establishedPositions) {
      const existing = memory.establishedPositions.find(p => p.position === pos.position);
      if (existing) {
        if (pos.confidence > existing.confidence) {
          existing.evidence = pos.evidence;
          existing.confidence = pos.confidence;
        }
        existing.sourceRefs = [...new Set([...existing.sourceRefs, ...pos.sourceRefs])];
      } else {
        memory.establishedPositions.push(pos);
      }
    }

    // Merge controversies
    for (const cont of extraction.controversies) {
      const existing = memory.controversies.find(c => c.topic === cont.topic);
      if (existing) {
        // Update the controversy state
        existing.lastUpdated = Date.now();
        if (cont.currentLean) existing.currentLean = cont.currentLean;
        // Update positions with new evidence
        if (cont.positionA.evidence) existing.positionA.evidence = cont.positionA.evidence;
        if (cont.positionB.evidence) existing.positionB.evidence = cont.positionB.evidence;
      } else {
        memory.controversies.push(cont);
      }
    }

    // Merge paradigm shifts
    for (const shift of extraction.paradigmShifts) {
      if (!memory.paradigmShifts.some(p => p.shift === shift.shift)) {
        memory.paradigmShifts.push(shift);
      }
    }

    // Update source reliability
    for (const source of sources) {
      const existing = memory.keySources.find(s => s.sourceId === source.id);
      if (existing) {
        existing.citationCount++;
        // Boost reliability slightly each time it's cited
        existing.reliability = Math.min(1, existing.reliability + 0.01);
      } else {
        memory.keySources.push({
          sourceId: source.id,
          title: source.title,
          reliability: 0.5, // Start neutral
          citationCount: 1,
          domains: [domain],
        });
      }
    }

    // Limit memory size (keep most important)
    memory.concepts = memory.concepts.sort((a, b) => b.confidence - a.confidence).slice(0, 50);
    memory.establishedPositions = memory.establishedPositions.sort((a, b) => b.confidence - a.confidence).slice(0, 30);
    memory.controversies = memory.controversies.sort((a, b) => b.lastUpdated - a.lastUpdated).slice(0, 20);
    memory.keySources = memory.keySources.sort((a, b) => b.citationCount - a.citationCount).slice(0, 50);
    memory.paradigmShifts = memory.paradigmShifts.slice(-10);
    memory.updatedAt = Date.now();

    await persistDomainMemory(memory);
  }

  // Update cross-domain links
  for (const link of extraction.crossDomainLinks) {
    await persistCrossDomainLink(link);
  }

  console.log(`[WorldModel] Updated ${domains.length} domains with ${extraction.concepts.length} concepts, ${extraction.establishedPositions.length} positions, ${extraction.controversies.length} controversies`);
}

// ─── Knowledge Extraction ───────────────────────────────────────────────────

interface KnowledgeExtraction {
  concepts: ConceptEntry[];
  establishedPositions: PositionEntry[];
  controversies: ControversyEntry[];
  paradigmShifts: ParadigmShiftEntry[];
  crossDomainLinks: CrossDomainLink[];
}

async function extractKnowledge(
  query: string,
  analysis: string,
  sources: Array<{ id: string; title: string }>,
): Promise<KnowledgeExtraction> {
  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a knowledge extraction system. Extract structured knowledge from a research analysis that can be stored in a World Model for future use.

Extract:
1. Concepts — key concepts and their definitions
2. Established positions — well-supported findings
3. Controversies — ongoing debates with both sides
4. Paradigm shifts — if any recent paradigm shifts are mentioned
5. Cross-domain links — connections between concepts across different domains

Respond with JSON:
{
  "concepts": [
    {"concept": "name", "definition": "...", "relatedConcepts": ["..."], "confidence": 0.8, "sourceRefs": ["SRC-1"]}
  ],
  "establishedPositions": [
    {"position": "...", "evidence": "...", "confidence": 0.85, "sourceRefs": ["SRC-1", "SRC-2"]}
  ],
  "controversies": [
    {
      "topic": "...",
      "positionA": {"label": "...", "evidence": "...", "sourceRefs": ["SRC-1"]},
      "positionB": {"label": "...", "evidence": "...", "sourceRefs": ["SRC-2"]},
      "state": "active",
      "currentLean": "A"
    }
  ],
  "paradigmShifts": [
    {"shift": "...", "oldParadigm": "...", "newParadigm": "...", "date": "2024", "triggerSources": ["SRC-1"]}
  ],
  "crossDomainLinks": [
    {"conceptA": "...", "domainA": "economics", "conceptB": "...", "domainB": "climate", "connection": "...", "strength": 0.7}
  ]
}

Only extract claims that are well-supported by the cited sources. Be conservative with confidence scores.`,
        },
        {
          role: 'user',
          content: `Query: "${query}"

Sources: ${sources.map(s => `${s.id}: ${s.title}`).join('\n')}

Analysis:
${analysis.slice(0, 6000)}

Extract knowledge:`,
        },
      ],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 3000,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<KnowledgeExtraction>(response.content);
    if (parsed) {
      return {
        concepts: parsed.concepts || [],
        establishedPositions: parsed.establishedPositions || [],
        controversies: (parsed.controversies || []).map(c => ({
          ...c,
          lastUpdated: Date.now(),
        })),
        paradigmShifts: parsed.paradigmShifts || [],
        crossDomainLinks: (parsed.crossDomainLinks || []).map(l => ({
          ...l,
          discoveredAt: Date.now(),
        })),
      };
    }
  } catch (err) {
    console.warn('[WorldModel] Knowledge extraction failed:', err);
  }

  return { concepts: [], establishedPositions: [], controversies: [], paradigmShifts: [], crossDomainLinks: [] };
}

// ─── Domain Identification ──────────────────────────────────────────────────

async function identifyDomains(query: string): Promise<string[]> {
  const knownDomains = [
    'economics', 'climate', 'ai_policy', 'public_health', 'geopolitics',
    'finance', 'education', 'energy', 'agriculture', 'defense',
    'technology', 'sociology', 'law', 'medicine', 'biology',
    'psychology', 'political_science', 'environmental_science',
  ];

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `Identify which research domains this query relates to. Respond with JSON: {"domains": ["economics", "climate"]}. Use only these known domains: ${knownDomains.join(', ')}. Pick 1-3 most relevant.`,
        },
        { role: 'user', content: query },
      ],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 100,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<{ domains: string[] }>(response.content);
    if (parsed?.domains && Array.isArray(parsed.domains)) {
      return parsed.domains.filter(d => knownDomains.includes(d));
    }
  } catch {}

  // Fallback: keyword matching
  const queryLower = query.toLowerCase();
  const matches: string[] = [];
  const keywordMap: Record<string, string[]> = {
    economics: ['economic', 'tax', 'gdp', 'market', 'trade', 'financial'],
    climate: ['climate', 'carbon', 'emission', 'temperature', 'warming'],
    ai_policy: ['ai', 'artificial intelligence', 'algorithm', 'automation', 'machine learning'],
    public_health: ['health', 'disease', 'pandemic', 'vaccine', 'medical'],
    geopolitics: ['geopolit', 'war', 'conflict', 'nation', 'strategic', 'alliance'],
  };

  for (const [domain, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(k => queryLower.includes(k))) {
      matches.push(domain);
    }
  }

  return matches.length > 0 ? matches.slice(0, 3) : ['general'];
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function persistDomainMemory(memory: DomainMemory): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: 'world_model',
        action: `DOMAIN_UPDATE_${memory.domain}`,
        metadata: JSON.stringify(memory),
      },
    });
  } catch (err) {
    console.warn(`[WorldModel] Failed to persist domain ${memory.domain}:`, err);
  }
}

async function loadDomainMemory(domain: string): Promise<DomainMemory | null> {
  try {
    const record = await prisma.agentAuditLog.findFirst({
      where: {
        agent: 'world_model',
        action: `DOMAIN_UPDATE_${domain}`,
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!record) return null;

    return JSON.parse(record.metadata || '{}') as DomainMemory;
  } catch (err) {
    console.warn(`[WorldModel] Failed to load domain ${domain}:`, err);
    return null;
  }
}

async function persistCrossDomainLink(link: CrossDomainLink): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: 'world_model',
        action: 'CROSS_DOMAIN_LINK',
        metadata: JSON.stringify(link),
      },
    });
  } catch (err) {
    console.warn('[WorldModel] Failed to persist cross-domain link:', err);
  }
}

async function findCrossDomainLinks(domains: string[]): Promise<CrossDomainLink[]> {
  if (domains.length < 2) return [];

  try {
    const records = await prisma.agentAuditLog.findMany({
      where: {
        agent: 'world_model',
        action: 'CROSS_DOMAIN_LINK',
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    const links: CrossDomainLink[] = [];
    for (const record of records) {
      try {
        const link = JSON.parse(record.metadata || '{}') as CrossDomainLink;
        // Check if this link connects any of our domains
        if (domains.includes(link.domainA) && domains.includes(link.domainB)) {
          links.push(link);
        }
      } catch {}
    }

    return links.slice(0, 10);
  } catch (err) {
    console.warn('[WorldModel] Failed to find cross-domain links:', err);
    return [];
  }
}

// ─── World Model Injection ──────────────────────────────────────────────────

/**
 * Build a context block from the World Model for injection into the pipeline.
 */
export async function buildWorldModelInjection(query: string): Promise<{
  contextBlock: string;
  reliableSourceIds: string[];
  knownControversies: string[];
}> {
  const { priorKnowledge, reliableSources, knownControversies } = await queryWorldModel(query);

  let contextBlock = '';
  if (priorKnowledge) {
    contextBlock = `## WORLD MODEL — Prior knowledge from past runs\n\n${priorKnowledge}`;
  }

  return {
    contextBlock,
    reliableSourceIds: reliableSources,
    knownControversies,
  };
}
