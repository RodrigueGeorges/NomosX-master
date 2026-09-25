/**
 * Memory Consolidation — STM→LTM promotion (AgeMem / memorywire pattern).
 *
 * The pipeline stores episodic records (EPISODE_STORED) and procedural
 * lessons (LESSON_LEARNED), but nothing compresses recurring experience into
 * durable SEMANTIC knowledge. Without consolidation, episodic memory grows
 * forever and never becomes "what we know".
 *
 * This cron-side module:
 *   1. Reads recent episodes + lessons
 *   2. Groups them by domain
 *   3. LLM-digests each cluster into consolidated domain patterns
 *      ("for geopolitics questions, provider X yields thin sources; combine
 *      with heritage providers") 
 *   4. Persists them as SEMANTIC_PATTERN records — durable, dedup-guarded
 *
 * Runs at most once every 24h (self-throttling via the latest record's
 * timestamp). Zero schema changes — reuses AgentAuditLog.
 */

import { prisma } from '../db';
import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

const CONSOLIDATION_AGENT = 'memory-consolidation';
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const EPISODE_LOOKBACK_DAYS = 30;
const MAX_EPISODES = 120;
const MAX_PATTERNS_PER_DOMAIN = 3;

export interface ConsolidationResult {
  ran: boolean;
  skippedReason?: string;
  episodesRead: number;
  lessonsRead: number;
  domainsProcessed: number;
  patternsStored: number;
  costUsd: number;
  durationMs: number;
}

const CONSOLIDATION_PROMPT = `You are consolidating an agent's episodic memory into durable semantic knowledge.

Below are records of past research runs in the domain "{DOMAIN}" — what was researched, what worked, what failed, and lessons already extracted.

EPISODES AND LESSONS:
{RECORDS}

TASK — extract consolidated SEMANTIC PATTERNS: durable facts about how research in this domain works best. A pattern is NOT a summary of one run — it is a generalization supported by multiple observations.

Good patterns look like:
- "Energy-security questions consistently need institutional data (IEA, OPEC) — academic providers return thin coverage"
- "Runs combining historical + economic lenses produced trust scores >80; runs with only 'core' lens stayed <60"
- "French-language sources (Persée, Cairn) materially improve coverage of EU-policy questions"

Bad patterns (DO NOT produce): one-off observations, restatements of a single lesson, vague advice ("be thorough").

Return JSON:
{
  "patterns": [
    {
      "pattern": "durable fact about this domain's research strategy",
      "evidence": "which observations support it",
      "confidence": 0.0-1.0,
      "applicability": "when does this pattern apply (trigger condition)"
    }
  ]
}

Produce at most ${MAX_PATTERNS_PER_DOMAIN} patterns. If the records show no recurring structure, return an empty array — do NOT invent patterns.`;

interface EpisodeLike {
  text: string;
  domain: string;
}

/**
 * Retrieve stored semantic patterns for a domain — used to enrich
 * primeContext/planning with consolidated knowledge.
 */
export async function getSemanticPatterns(domain: string): Promise<string[]> {
  try {
    const records = await prisma.agentAuditLog.findMany({
      where: { agent: CONSOLIDATION_AGENT, action: 'SEMANTIC_PATTERN' },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
    const patterns: string[] = [];
    for (const r of records) {
      try {
        const m = JSON.parse(r.metadata || '{}');
        if (m.domain === domain && typeof m.pattern === 'string') {
          patterns.push(m.pattern);
        }
      } catch { /* skip malformed */ }
    }
    return patterns.slice(0, 6);
  } catch {
    return [];
  }
}

/**
 * Run the consolidation cycle. Self-throttles to once per 24h.
 */
export async function consolidateEpisodicMemory(): Promise<ConsolidationResult> {
  const start = Date.now();
  const result: ConsolidationResult = {
    ran: false,
    episodesRead: 0,
    lessonsRead: 0,
    domainsProcessed: 0,
    patternsStored: 0,
    costUsd: 0,
    durationMs: 0,
  };

  try {
    // Throttle: skip if we consolidated within the last 24h
    const lastRun = await prisma.agentAuditLog.findFirst({
      where: { agent: CONSOLIDATION_AGENT, action: 'CONSOLIDATION_RUN' },
      orderBy: { timestamp: 'desc' },
    });
    if (lastRun && Date.now() - lastRun.timestamp.getTime() < MIN_INTERVAL_MS) {
      result.skippedReason = 'consolidated within last 24h';
      result.durationMs = Date.now() - start;
      return result;
    }

    // Gather episodic records + lessons
    const since = new Date(Date.now() - EPISODE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const [episodes, lessons] = await Promise.all([
      prisma.agentAuditLog.findMany({
        where: { action: 'EPISODE_STORED', timestamp: { gte: since } },
        orderBy: { timestamp: 'desc' },
        take: MAX_EPISODES,
      }),
      prisma.agentAuditLog.findMany({
        where: { action: 'LESSON_LEARNED', timestamp: { gte: since } },
        orderBy: { timestamp: 'desc' },
        take: MAX_EPISODES,
      }),
    ]);
    result.episodesRead = episodes.length;
    result.lessonsRead = lessons.length;

    if (episodes.length + lessons.length < 8) {
      result.skippedReason = `insufficient records (${episodes.length + lessons.length} < 8)`;
      result.durationMs = Date.now() - start;
      return result;
    }

    // Normalize records into domain-clustered text
    const byDomain = new Map<string, EpisodeLike[]>();
    const pushRecord = (raw: string | null, fallbackDomain: string) => {
      try {
        const m = JSON.parse(raw || '{}');
        const text = m.lesson || m.query || m.summary || JSON.stringify(m).slice(0, 300);
        const domain = m.domain || m.domains?.[0] || fallbackDomain;
        const arr = byDomain.get(domain) ?? [];
        arr.push({ text: String(text).slice(0, 300), domain });
        byDomain.set(domain, arr);
      } catch { /* skip */ }
    };
    for (const e of episodes) pushRecord(e.metadata, 'general');
    for (const l of lessons) pushRecord(l.metadata, 'general');

    // Digest each domain cluster (cap 5 domains per run to bound cost)
    const domains = [...byDomain.entries()]
      .filter(([, recs]) => recs.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5);

    for (const [domain, records] of domains) {
      result.domainsProcessed++;
      const recordsText = records.slice(0, 30).map((r, i) => `${i + 1}. ${r.text}`).join('\n');
      const prompt = CONSOLIDATION_PROMPT
        .replace('{DOMAIN}', domain)
        .replace('{RECORDS}', recordsText.slice(0, 6000));

      try {
        const response = await callLLM({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          jsonMode: true,
          maxTokens: 1200,
          task: 'topic_classification',
        });
        result.costUsd += typeof response.costUsd === 'number' ? response.costUsd : 0;

        const parsed = parseJson<{ patterns?: Array<{ pattern?: string; evidence?: string; confidence?: number; applicability?: string }> }>(response.content);
        const patterns = (parsed?.patterns || [])
          .filter(p => typeof p.pattern === 'string' && p.pattern.length > 20 && (p.confidence ?? 0) >= 0.5)
          .slice(0, MAX_PATTERNS_PER_DOMAIN);

        // Dedup against existing patterns for this domain (string containment)
        const existing = await getSemanticPatterns(domain);
        for (const p of patterns) {
          const isDup = existing.some(e =>
            e.toLowerCase().includes(p.pattern!.toLowerCase().slice(0, 60)) ||
            p.pattern!.toLowerCase().includes(e.toLowerCase().slice(0, 60))
          );
          if (isDup) continue;
          await prisma.agentAuditLog.create({
            data: {
              agent: CONSOLIDATION_AGENT,
              action: 'SEMANTIC_PATTERN',
              metadata: JSON.stringify({
                domain,
                pattern: p.pattern,
                evidence: p.evidence,
                applicability: p.applicability,
                confidence: p.confidence,
                consolidatedFrom: records.length,
              }),
            },
          });
          result.patternsStored++;
        }
      } catch (err) {
        console.warn(`[MemoryConsolidation] domain "${domain}" failed (non-blocking):`, String(err).slice(0, 80));
      }
    }

    // Mark the run (throttle anchor)
    await prisma.agentAuditLog.create({
      data: {
        agent: CONSOLIDATION_AGENT,
        action: 'CONSOLIDATION_RUN',
        metadata: JSON.stringify({
          episodesRead: result.episodesRead,
          lessonsRead: result.lessonsRead,
          domainsProcessed: result.domainsProcessed,
          patternsStored: result.patternsStored,
        }),
      },
    });

    result.ran = true;
    result.durationMs = Date.now() - start;
    return result;
  } catch (err) {
    console.warn('[MemoryConsolidation] failed (non-blocking):', String(err).slice(0, 120));
    result.skippedReason = `error: ${String(err).slice(0, 80)}`;
    result.durationMs = Date.now() - start;
    return result;
  }
}
