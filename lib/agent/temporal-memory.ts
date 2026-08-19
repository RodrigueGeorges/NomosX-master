/**
 * Temporal Memory — NomosX Sprint 6 (Gap 9)
 *
 * Bi-temporal knowledge tracking for the World Model.
 * Inspired by :
 * - Graphiti (getzep/graphiti) — temporal knowledge graph with bi-temporal validity
 * - Zep (getzep/zep) — long-term memory with temporal context
 * - HippoRAG — neurobiologically inspired long-term memory
 *
 * Le problème :
 * Le World Model et Agent Memory de NomosX sont *snapshot*. On ne sait pas
 * quand un fait était vrai, quand il a été enregistré, et comment les positions
 * ont évolué. Le Temporal Memory ajoute des fenêtres de validité bi-temporelles :
 * - validFrom / validTo : quand le fait était vrai dans le monde réel
 * - recordedAt : quand le système l'a appris
 * - supersededBy : quel fait plus récent remplace celui-ci
 *
 * Cas d'usage :
 * - "Que savait-on en 2025 sur X ?"
 * - "Quand le consensus a-t-il basculé ?"
 * - "Cette position s'est-elle modifiée après telle étude ?"
 * - Researcher Identity : détecter explicitement les changements de position
 *
 * Intégration : étend ConceptNode / ConceptRelation du Knowledge Graph.
 */

import { prisma } from '../db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemporalFact {
  id: string;
  /** The fact statement (claim) */
  claim: string;
  /** Domain or topic */
  domain: string;
  /** Concept IDs this fact relates to */
  conceptIds: string[];
  /** When the fact became true (in the real world) */
  validFrom?: Date;
  /** When the fact stopped being true (null if still true) */
  validTo?: Date | null;
  /** When the system recorded this fact */
  recordedAt: Date;
  /** Source IDs supporting this fact */
  sourceIds: string[];
  /** Confidence (0-100) */
  confidence: number;
  /** ID of the newer fact that supersedes this one */
  supersededBy?: string | null;
  /** True if this fact is the current best knowledge */
  isCurrent: boolean;
  /** Brief ID where this fact was extracted */
  briefId?: string;
}

export interface PositionEvolution {
  conceptId: string;
  conceptName: string;
  /** Timeline of positions on this concept */
  positions: Array<{
    /** The position/stance at a given time */
    stance: string;
    validFrom: Date;
    validTo?: Date | null;
    confidence: number;
    sourceIds: string[];
    supersededBy?: string | null;
  }>;
  /** When the position shifted */
  shifts: Array<{
    from: string;
    to: string;
    date: Date;
    trigger?: string; // e.g., "new study by Smith et al. 2025"
  }>;
}

export interface TemporalQueryOptions {
  /** Query as of this date (valid time) */
  asOf?: Date;
  /** Query facts recorded after this date (transaction time) */
  recordedAfter?: Date;
  /** Query facts recorded before this date */
  recordedBefore?: Date;
  /** Concept IDs to filter by */
  conceptIds?: string[];
  /** Domain to filter by */
  domain?: string;
  /** Whether to include superseded facts */
  includeSuperseded?: boolean;
}

// ─── Create / Update Temporal Fact ──────────────────────────────────────────

/**
 * Record a new temporal fact.
 * If an existing fact on the same concept+claim is already current, mark it as superseded.
 */
export async function recordTemporalFact(
  fact: Omit<TemporalFact, 'id' | 'recordedAt' | 'isCurrent'>,
): Promise<TemporalFact> {
  const now = new Date();

  // Find current conflicting facts (same claim, overlapping concepts)
  const existing = await findCurrentFacts({
    conceptIds: fact.conceptIds,
    domain: fact.domain,
  });

  const similar = existing.filter(e =>
    e.claim.toLowerCase().includes(fact.claim.toLowerCase().slice(0, 50)) ||
    fact.claim.toLowerCase().includes(e.claim.toLowerCase().slice(0, 50))
  );

  // Create the new fact
  const newFact: TemporalFact = {
    ...fact,
    id: `tf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    recordedAt: now,
    isCurrent: true,
    validFrom: fact.validFrom || now,
    validTo: fact.validTo || null,
  };

  // Supersede similar older facts
  for (const oldFact of similar) {
    await updateFact(oldFact.id, {
      validTo: fact.validFrom || now,
      isCurrent: false,
      supersededBy: newFact.id,
    });
  }

  await persistTemporalFact(newFact);

  return newFact;
}

// ─── Query Temporal Facts ───────────────────────────────────────────────────

/**
 * Query the temporal knowledge base.
 * Supports "as-of" queries (valid time) and transaction-time queries.
 */
export async function queryTemporalFacts(
  options: TemporalQueryOptions,
): Promise<TemporalFact[]> {
  const asOf = options.asOf;
  const recordedAfter = options.recordedAfter;
  const recordedBefore = options.recordedBefore;

  // In-memory cache approach: load and filter
  const allFacts = await loadAllFacts();

  return allFacts.filter(fact => {
    // Filter by concept/domain
    if (options.conceptIds && !fact.conceptIds.some(c => options.conceptIds?.includes(c))) {
      return false;
    }
    if (options.domain && fact.domain !== options.domain) {
      return false;
    }

    // Transaction time filter (recordedAt)
    if (recordedAfter && fact.recordedAt < recordedAfter) return false;
    if (recordedBefore && fact.recordedAt > recordedBefore) return false;

    // Valid time filter (as-of)
    if (asOf) {
      const validFrom = fact.validFrom || new Date('1970-01-01');
      const validTo = fact.validTo;
      if (asOf < validFrom) return false;
      if (validTo && asOf > validTo) return false;
    }

    // Include superseded?
    if (!options.includeSuperseded && !fact.isCurrent) {
      // But still include if as-of was during its validity
      if (asOf) {
        const validFrom = fact.validFrom || new Date('1970-01-01');
        const validTo = fact.validTo;
        if (asOf >= validFrom && (!validTo || asOf <= validTo)) {
          return true;
        }
      }
      return false;
    }

    return true;
  });
}

/**
 * Find currently valid facts for given concepts/domain.
 */
export async function findCurrentFacts(options: { conceptIds?: string[]; domain?: string }): Promise<TemporalFact[]> {
  const now = new Date();
  return queryTemporalFacts({
    ...options,
    asOf: now,
    includeSuperseded: false,
  });
}

// ─── Position Evolution ─────────────────────────────────────────────────────

/**
 * Track how a position/concept evolved over time.
 */
export async function getPositionEvolution(
  conceptId: string,
  conceptName?: string,
): Promise<PositionEvolution> {
  const allFacts = await loadAllFacts();
  const relevant = allFacts
    .filter(f => f.conceptIds.includes(conceptId))
    .sort((a, b) => (a.validFrom?.getTime() || 0) - (b.validFrom?.getTime() || 0));

  const positions = relevant.map(f => ({
    stance: f.claim,
    validFrom: f.validFrom || f.recordedAt,
    validTo: f.validTo,
    confidence: f.confidence,
    sourceIds: f.sourceIds,
    supersededBy: f.supersededBy,
  }));

  const shifts: PositionEvolution['shifts'] = [];
  for (let i = 1; i < relevant.length; i++) {
    const prev = relevant[i - 1];
    const curr = relevant[i];
    if (prev.supersededBy === curr.id) {
      shifts.push({
        from: prev.claim,
        to: curr.claim,
        date: curr.validFrom || curr.recordedAt,
        trigger: `Superseded by newer fact recorded at ${curr.recordedAt.toISOString()}`,
      });
    }
  }

  return {
    conceptId,
    conceptName: conceptName || conceptId,
    positions,
    shifts,
  };
}

// ─── Add Temporal Fields to Knowledge Graph ─────────────────────────────────

/**
 * Add bi-temporal fields to an existing concept in the Knowledge Graph.
 * This is a migration helper.
 */
export async function ensureTemporalFields(): Promise<void> {
  try {
    // Check if the ConceptNode model has temporal fields
    const anyNode = await prisma.conceptNode.findFirst();
    if (anyNode) {
      // In a real migration, we'd use Prisma migrate. Here we log a message.
      console.log('[TemporalMemory] ConceptNode temporal fields should be present: validFrom, validTo, recordedAt, supersededBy');
    }
  } catch (err) {
    console.warn('[TemporalMemory] Failed to check temporal fields:', err);
  }
}

// ─── Build memory injection for Researcher Identity ─────────────────────────

/**
 * Build a prompt injection that shows the evolution of knowledge on a topic.
 * Useful for the Researcher Identity: "Your prior position was X, but now it is Y."
 */
export async function buildTemporalMemoryInjection(
  conceptIds: string[],
  asOf?: Date,
): Promise<string> {
  const facts = await queryTemporalFacts({ conceptIds, asOf });

  if (facts.length === 0) return '';

  const lines = ['\n=== TEMPORAL KNOWLEDGE ==='];
  lines.push(`View as of: ${asOf ? asOf.toISOString() : 'now'}`);

  for (const fact of facts.slice(0, 10)) {
    const validFrom = fact.validFrom?.toISOString().slice(0, 10) || 'unknown';
    const validTo = fact.validTo ? ` to ${fact.validTo.toISOString().slice(0, 10)}` : '';
    lines.push(`- [${validFrom}${validTo}] ${fact.claim} (confidence: ${fact.confidence}%) [SRC: ${fact.sourceIds.join(', ')}]`);
  }

  lines.push('=== END TEMPORAL KNOWLEDGE ===');
  return lines.join('\n');
}

// ─── Persistence (using AgentAuditLog as lightweight store) ──────────────────

async function persistTemporalFact(fact: TemporalFact): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        action: 'TEMPORAL_FACT',
        agent: 'temporal_memory',
        resource: `temporal_${fact.id}`,
        metadata: JSON.stringify(fact),
        timestamp: fact.recordedAt,
      },
    });
  } catch (err) {
    console.warn('[TemporalMemory] Persist failed:', err);
  }
}

async function updateFact(id: string, updates: Partial<TemporalFact>): Promise<void> {
  try {
    // In a real implementation, this would update the DB record.
    // With AgentAuditLog, we store a correction log.
    await prisma.agentAuditLog.create({
      data: {
        action: 'TEMPORAL_FACT_UPDATE',
        agent: 'temporal_memory',
        resource: `temporal_${id}`,
        metadata: JSON.stringify({ id, updates }),
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.warn('[TemporalMemory] Update failed:', err);
  }
}

async function loadAllFacts(): Promise<TemporalFact[]> {
  try {
    const records = await prisma.agentAuditLog.findMany({
      where: { action: { in: ['TEMPORAL_FACT', 'TEMPORAL_FACT_UPDATE'] } },
      orderBy: { timestamp: 'asc' },
      take: 5000,
    });

    const facts = new Map<string, TemporalFact>();

    for (const record of records) {
      const metadata = record.metadata || '{}';
      if (record.action === 'TEMPORAL_FACT') {
        const fact = JSON.parse(metadata) as TemporalFact;
        facts.set(fact.id, fact);
      } else if (record.action === 'TEMPORAL_FACT_UPDATE') {
        const data = JSON.parse(metadata) as { id: string; updates: Partial<TemporalFact> };
        const existing = facts.get(data.id);
        if (existing) {
          facts.set(data.id, { ...existing, ...data.updates });
        }
      }
    }

    return Array.from(facts.values());
  } catch (err) {
    console.warn('[TemporalMemory] Load failed:', err);
    return [];
  }
}
