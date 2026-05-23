/**
 * Hierarchical swarm — 512 numeric crowd agents + voice leader personas
 * Scales like OASIS without 512 LLM calls per tick
 */

import type { SwarmLeader } from "./foresight-types";

export interface CrowdAgent {
  id: string;
  clusterId: string;
  positions: Record<string, number>;
  activity: number;
  susceptibility: number;
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function spawnCrowd(
  count: number,
  leaders: SwarmLeader[],
  scenarioNames: string[],
  seed: number
): CrowdAgent[] {
  const rand = mulberry32(seed);
  const crowd: CrowdAgent[] = [];

  for (let i = 0; i < count; i++) {
    const leader = leaders[i % leaders.length];
    const positions: Record<string, number> = {};
    const raw = scenarioNames.map(() => rand());
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    scenarioNames.forEach((name, j) => {
      const leaderPos = leader.positions[name] ?? 0;
      positions[name] = 0.65 * (raw[j] / sum) + 0.35 * leaderPos;
    });
    const norm = scenarioNames.reduce((s, n) => s + positions[n], 0) || 1;
    scenarioNames.forEach((n) => { positions[n] /= norm; });

    crowd.push({
      id: `crowd-${i}`,
      clusterId: leader.id,
      positions,
      activity: 0.2 + rand() * 0.8,
      susceptibility: 0.15 + rand() * 0.45,
    });
  }
  return crowd;
}

export function propagateCrowd(
  crowd: CrowdAgent[],
  leaders: SwarmLeader[],
  viralBoost: Record<string, number>,
  scenarioNames: string[],
  alpha = 0.12
): number {
  const leaderMap = new Map(leaders.map((l) => [l.id, l]));
  let shifts = 0;

  for (const agent of crowd) {
    const leader = leaderMap.get(agent.clusterId);
    if (!leader) continue;

    for (const name of scenarioNames) {
      const viral = viralBoost[name] ?? 0;
      const target =
        0.5 * (leader.positions[name] ?? 0) +
        0.3 * (agent.positions[name] ?? 0) +
        0.2 * viral * agent.susceptibility;
      const prev = agent.positions[name] ?? 0;
      agent.positions[name] = prev * (1 - alpha) + target * alpha;
      if (Math.abs(agent.positions[name] - prev) > 0.03) shifts++;
    }
    const sum = scenarioNames.reduce((s, n) => s + (agent.positions[n] ?? 0), 0) || 1;
    scenarioNames.forEach((n) => { agent.positions[n] /= sum; });
  }
  return shifts;
}

export function aggregateCrowdMomentum(
  crowd: CrowdAgent[],
  scenarioNames: string[]
): Record<string, number> {
  const momentum: Record<string, number> = {};
  for (const name of scenarioNames) {
    let m = 0;
    for (const agent of crowd) {
      m += (agent.positions[name] ?? 0) * agent.activity;
    }
    momentum[name] = m / Math.max(1, crowd.length * 0.55);
  }
  return momentum;
}

export function syncLeadersFromCrowd(
  leaders: SwarmLeader[],
  crowd: CrowdAgent[],
  scenarioNames: string[],
  weight = 0.25
): void {
  for (const leader of leaders) {
    const cluster = crowd.filter((c) => c.clusterId === leader.id);
    if (!cluster.length) continue;
    for (const name of scenarioNames) {
      const avg =
        cluster.reduce((s, c) => s + (c.positions[name] ?? 0), 0) / cluster.length;
      leader.positions[name] =
        (1 - weight) * (leader.positions[name] ?? 0) + weight * avg;
    }
    const sum = scenarioNames.reduce((s, n) => s + (leader.positions[n] ?? 0), 0) || 1;
    scenarioNames.forEach((n) => { leader.positions[n] /= sum; });
  }
}
