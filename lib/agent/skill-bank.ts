/**
 * SKILL BANK — NomosX
 *
 * Procedural memory for research strategies (FlowEvo/SkillGLoW pattern, 2026).
 * When a pipeline run produces a high-trust result, the winning configuration
 * (domain → providers + lens types) is compiled into a reusable "skill".
 *
 * On subsequent runs in the same domain, proven skills bias retrieval toward
 * the provider/lens mix that previously produced trust ≥ 80.
 *
 * Storage: AgentAuditLog rows with action 'SKILL_RECORD' — no schema change.
 * A skill is promoted to "proven" after ≥2 uses with avg trust ≥ 80.
 */

import { prisma } from '../db';

export interface SkillRecord {
  domain: string;
  providers: string[];
  lensTypes: string[];
  trustScore: number;
  runId: string;
}

export interface ProvenSkill {
  domain: string;
  providers: string[];
  lensTypes: string[];
  uses: number;
  avgTrust: number;
}

const SKILL_ACTION = 'SKILL_RECORD';
const PROMOTE_MIN_USES = 2;
const PROMOTE_MIN_TRUST = 80;
const LOOKBACK = 100;

// ─── Record a winning configuration ──────────────────────────────────────────

export async function recordSkill(record: SkillRecord): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: 'skill-bank',
        action: SKILL_ACTION,
        resource: record.runId,
        metadata: JSON.stringify({
          domain: record.domain,
          providers: record.providers.slice(0, 30),
          lensTypes: record.lensTypes,
          trustScore: record.trustScore,
        }),
      },
    });
  } catch (err) {
    console.warn('[SKILL BANK] recordSkill failed (non-blocking):', err);
  }
}

// ─── Retrieve the best proven skill for a domain ─────────────────────────────

export async function getProvenSkill(domain: string): Promise<ProvenSkill | null> {
  try {
    const rows = await prisma.agentAuditLog.findMany({
      where: { agent: 'skill-bank', action: SKILL_ACTION },
      orderBy: { timestamp: 'desc' },
      take: LOOKBACK,
    });

    // Aggregate by provider+lens signature within the domain
    const signatures = new Map<string, { providers: string[]; lensTypes: string[]; trusts: number[] }>();
    for (const row of rows) {
      try {
        const m = JSON.parse(row.metadata || '{}');
        if (m.domain !== domain || !Array.isArray(m.providers)) continue;
        const key = [...(m.providers as string[])].sort().join(',') + '|' + [...(m.lensTypes || [])].sort().join(',');
        const entry = signatures.get(key) || { providers: m.providers as string[], lensTypes: (m.lensTypes || []) as string[], trusts: [] as number[] };
        entry.trusts.push(m.trustScore || 0);
        signatures.set(key, entry);
      } catch { continue; }
    }

    // Find the best proven signature
    let best: ProvenSkill | null = null;
    for (const sig of signatures.values()) {
      if (sig.trusts.length < PROMOTE_MIN_USES) continue;
      const avgTrust = sig.trusts.reduce((a, b) => a + b, 0) / sig.trusts.length;
      if (avgTrust < PROMOTE_MIN_TRUST) continue;
      if (!best || avgTrust > best.avgTrust) {
        best = { domain, providers: sig.providers, lensTypes: sig.lensTypes, uses: sig.trusts.length, avgTrust };
      }
    }
    return best;
  } catch (err) {
    console.warn('[SKILL BANK] getProvenSkill failed (non-blocking):', err);
    return null;
  }
}

// ─── Apply a proven skill: reorder providers so proven ones lead ─────────────

export function applySkillToProviders<T extends string>(providers: T[], skill: ProvenSkill | null): T[] {
  if (!skill) return providers;
  const proven = new Set(skill.providers);
  const front = providers.filter(p => proven.has(p));
  const rest = providers.filter(p => !proven.has(p));
  return [...front, ...rest];
}
