/**
 * NomosX PRUNING GATES — Deterministic Post-Generation Quality Assurance
 *
 * Principles (from research best practices):
 * - Gates PRUNE, never BLOCK. Every publication is publishable by default.
 * - Gates are deterministic (code only, zero LLM). The LLM produces; code verifies and prunes.
 * - Trust propagates through the DAG: weak parents reduce confidence in children.
 * - A pruned link is removed before render. The reader never sees invalid content.
 * - No veto, no blocking threshold. The trust score is descriptive transparency.
 *
 * Gate order is economic: cheapest checks first, most expensive last.
 * All gates run in sequence on the CausalLink[] array.
 */

import type { CausalLink, TemporalStatus, AnalysisOutput } from './analyst-multipass';

// ============================================================================
// CONFIDENCE TIER (from agent-ready-papers claim registry pattern)
// ============================================================================

export type ConfidenceTier = 'ESTABLISHED' | 'SUPPORTED' | 'EMERGING' | 'SPECULATIVE';

export interface PruningResult {
  prunedChain: CausalLink[];
  removed: PrunedLink[];
  warnings: string[];
  trustPropagation: TrustNode[];
  confidenceTiers: Map<number, ConfidenceTier>;
  overallTrust: number; // 0-1, descriptive only
}

interface PrunedLink {
  link: CausalLink;
  reason: string;
  gate: string;
}

interface TrustNode {
  linkId: number;
  trust: number;       // 0-1
  inheritedTrust: number; // from parent
  finalTrust: number;  // min(own, inherited)
}

// ============================================================================
// GATE 1: CITATION SANITIZE — strip invalid [SRC-N] from all text fields
// ============================================================================

export function gateCitationSanitize(
  chain: CausalLink[],
  sourceCount: number
): { chain: CausalLink[]; removed: number } {
  const srcPattern = /\[SRC-(\d+)\]/g;
  let removed = 0;

  function sanitizeString(s: string): string {
    if (typeof s !== 'string') return s;
    return s.replace(srcPattern, (match, n) => {
      const num = parseInt(n, 10);
      if (num >= 1 && num <= sourceCount) return match;
      removed++;
      return '';
    }).replace(/\s+\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  }

  const cleaned = chain.map(link => ({
    ...link,
    claim: sanitizeString(link.claim),
    evidence: sanitizeString(link.evidence),
    warrant: sanitizeString(link.warrant),
    sourceRef: typeof link.sourceRef === 'number'
      ? (link.sourceRef >= 1 && link.sourceRef <= sourceCount ? link.sourceRef : undefined)
      : link.sourceRef,
  }));

  return { chain: cleaned, removed };
}

// ============================================================================
// GATE 2: CASCADE CHECK — future_extrapolation cannot derive from future_extrapolation
// ============================================================================

export function gateCascadeCheck(
  chain: CausalLink[]
): { chain: CausalLink[]; violations: number; details: string[] } {
  const details: string[] = [];
  const violatingIds = new Set<number>();

  for (const link of chain) {
    if (link.temporalStatus === 'future_extrapolation' && link.derivesFrom != null) {
      const parent = chain.find(l => l.id === link.derivesFrom);
      if (parent && parent.temporalStatus === 'future_extrapolation') {
        details.push(`Link #${link.id} (future) derives from future_extrapolation #${parent.id}`);
        violatingIds.add(link.id);
      }
    }
  }

  // Mark violating links as unsupported (they stay in chain but flagged)
  const result = chain.map(link =>
    violatingIds.has(link.id)
      ? { ...link, unsupported: true }
      : link
  );

  return { chain: result, violations: violatingIds.size, details };
}

// ============================================================================
// GATE 3: ORPHAN CHECK — links with derivesFrom pointing to non-existent or pruned parent
// ============================================================================

export function gateOrphanCheck(
  chain: CausalLink[]
): { chain: CausalLink[]; removed: CausalLink[]; details: string[] } {
  const details: string[] = [];
  const removed: CausalLink[] = [];
  const validIds = new Set(chain.map(l => l.id));

  // First pass: find links whose derivesFrom points to a non-existent parent
  const orphanIds = new Set<number>();
  for (const link of chain) {
    if (link.derivesFrom != null && !validIds.has(link.derivesFrom)) {
      details.push(`Link #${link.id} derives from missing parent #${link.derivesFrom}`);
      orphanIds.add(link.id);
    }
  }

  // Second pass: cascade removal — children of removed links also become orphans
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of chain) {
      if (orphanIds.has(link.id)) continue;
      if (link.derivesFrom != null && orphanIds.has(link.derivesFrom)) {
        details.push(`Link #${link.id} cascade-orphaned (parent #${link.derivesFrom} removed)`);
        orphanIds.add(link.id);
        changed = true;
      }
    }
  }

  const surviving = chain.filter(link => !orphanIds.has(link.id));
  for (const id of orphanIds) {
    const link = chain.find(l => l.id === id);
    if (link) removed.push(link);
  }

  return { chain: surviving, removed, details };
}

// ============================================================================
// GATE 4: MULTI-ROOT CHECK — only one root (derivesFrom: null) allowed
// ============================================================================

export function gateMultiRootCheck(
  chain: CausalLink[]
): { chain: CausalLink[]; removed: CausalLink[]; details: string[] } {
  const details: string[] = [];
  const roots = chain.filter(l => l.derivesFrom == null);

  if (roots.length <= 1) {
    return { chain, removed: [], details: [] };
  }

  // Keep the first root (by id), prune the rest and their descendants
  const keepRoot = roots.reduce((min, l) => l.id < min.id ? l : min, roots[0]);
  const prunedRootIds = new Set(roots.filter(r => r.id !== keepRoot.id).map(r => r.id));

  details.push(`Multiple roots found (${roots.length}): keeping #${keepRoot.id}, pruning ${prunedRootIds.size} alternatives`);

  // Cascade: descendants of pruned roots are also pruned
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of chain) {
      if (prunedRootIds.has(link.id)) continue;
      if (link.derivesFrom != null && prunedRootIds.has(link.derivesFrom)) {
        prunedRootIds.add(link.id);
        changed = true;
      }
    }
  }

  const surviving = chain.filter(link => !prunedRootIds.has(link.id));
  const removed = chain.filter(link => prunedRootIds.has(link.id));

  return { chain: surviving, removed, details };
}

// ============================================================================
// GATE 5: GROUNDING CHECK — present_fact must have sourceRef or [SRC-N] in evidence
// ============================================================================

export function gateGroundingCheck(
  chain: CausalLink[]
): { chain: CausalLink[]; removed: CausalLink[]; details: string[] } {
  const details: string[] = [];
  const ungroundedIds = new Set<number>();

  for (const link of chain) {
    if (link.temporalStatus !== 'present_fact') continue;

    const hasSourceRef = typeof link.sourceRef === 'number' && link.sourceRef > 0;
    const hasSrcInEvidence = typeof link.evidence === 'string' && /\[SRC-\d+\]/.test(link.evidence);
    const hasSrcInClaim = typeof link.claim === 'string' && /\[SRC-\d+\]/.test(link.claim);

    if (!hasSourceRef && !hasSrcInEvidence && !hasSrcInClaim) {
      details.push(`Link #${link.id} (present_fact) has no source grounding`);
      ungroundedIds.add(link.id);
    }
  }

  // Cascade: children of ungrounded present_facts lose their foundation
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of chain) {
      if (ungroundedIds.has(link.id)) continue;
      if (link.derivesFrom != null && ungroundedIds.has(link.derivesFrom)) {
        details.push(`Link #${link.id} cascade-ungrounded (parent #${link.derivesFrom} removed)`);
        ungroundedIds.add(link.id);
        changed = true;
      }
    }
  }

  const surviving = chain.filter(link => !ungroundedIds.has(link.id));
  const removed = chain.filter(link => ungroundedIds.has(link.id));

  return { chain: surviving, removed, details };
}

// ============================================================================
// GATE 6: DOMAIN TRAVEL CHECK — chain should cross domains (warning only)
// ============================================================================

export function gateDomainTravelCheck(
  chain: CausalLink[],
  mechanismDomains?: Map<number, string>
): { warnings: string[] } {
  const warnings: string[] = [];

  // Extract domains from mechanism map if available
  const domains = new Set<string>();
  if (mechanismDomains) {
    for (const d of mechanismDomains.values()) domains.add(d);
  }

  // If we have domain info and all links share one domain, warn
  if (domains.size > 0 && domains.size === 1) {
    warnings.push(`Chain operates in single domain (${[...domains][0]}) — no cross-domain travel`);
  }

  // If we have domain info and chain has no domain crossing, warn
  if (mechanismDomains && mechanismDomains.size > 0) {
    const chainDomains = new Set<string>();
    for (const link of chain) {
      const dom = mechanismDomains.get(link.id);
      if (dom) chainDomains.add(dom);
    }
    if (chainDomains.size < 2 && chain.length > 3) {
      warnings.push(`Chain of ${chain.length} links spans only ${chainDomains.size} domain(s) — expected cross-domain travel`);
    }
  }

  return { warnings };
}

// ============================================================================
// GATE 7: INFLECTION CHECK — chains ≥5 links should have a direction change
// ============================================================================

export function gateInflectionCheck(
  chain: CausalLink[],
  mechanismDirections?: Map<number, 'positive' | 'negative' | 'reversing' | 'unclear'>
): { warnings: string[] } {
  const warnings: string[] = [];

  if (chain.length < 5) return { warnings };

  if (mechanismDirections) {
    const hasReversing = [...mechanismDirections.values()].some(d => d === 'reversing');
    if (!hasReversing) {
      warnings.push(`Chain of ${chain.length} links has no inflection point (no reversing direction) — trajectory is purely inertial`);
    }
  } else {
    warnings.push(`Chain of ${chain.length} links — inflection check could not verify direction changes (no mechanism directions available)`);
  }

  return { warnings };
}

// ============================================================================
// GATE 8: HEDGING DETECT — strip hedging language from verdict (deterministic)
// ============================================================================

const HEDGE_PHRASES = [
  /\b(on the other hand|both\s+|both\s+sides of|it\s+is\s+worth\s+noting\s+that)\b/gi,
  /\b(while\s+it\s+is\s+true\s+that|admittedly|granted\s+that)\b/gi,
  /\b(perhaps|arguably|seemingly|ostensibly|presumably)\b/gi,
  /\b(it\s+appears\s+that|it\s+seems\s+that|one\s+might\s+argue)\b/gi,
];

const HEDGE_SOFTENERS = [
  { pattern: /\b(may\s+|might\s+|could\s+)(?=\b)/gi, replacement: '' },
  { pattern: /\b(suggests\s+that|tends\s+to|likely\s+)/gi, replacement: 'indicates that' },
  { pattern: /\b(it\s+is\s+possible\s+that|it\s+is\s+likely\s+that)\b/gi, replacement: '' },
  { pattern: /\b(appears\s+to|seems\s+to)\b/gi, replacement: 'does' },
];

export function gateHedgingStrip(
  verdict: string
): { cleaned: string; hedgeCount: number; modified: boolean } {
  let cleaned = verdict;
  let hedgeCount = 0;

  for (const pattern of HEDGE_PHRASES) {
    const matches = cleaned.match(pattern);
    if (matches) {
      hedgeCount += matches.length;
      cleaned = cleaned.replace(pattern, '');
    }
  }

  // T7: Softeners — replace with assertive equivalents
  for (const { pattern, replacement } of HEDGE_SOFTENERS) {
    const matches = cleaned.match(pattern);
    if (matches) {
      hedgeCount += matches.length;
      cleaned = cleaned.replace(pattern, replacement);
    }
  }

  // Clean up double spaces and capitalize
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  // Fix capitalization at start
  if (cleaned.length > 0) {
    cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
  }

  return {
    cleaned,
    hedgeCount,
    modified: hedgeCount > 0,
  };
}

// ============================================================================
// TRUST PROPAGATION — DAG-based confidence scoring
// ============================================================================

export function propagateTrust(
  chain: CausalLink[],
  verbatimVerified?: Set<number>
): { nodes: TrustNode[]; tiers: Map<number, ConfidenceTier>; overall: number } {
  const nodes: TrustNode[] = [];
  const tiers = new Map<number, ConfidenceTier>();

  // Build adjacency: parent → children
  const childrenMap = new Map<number | null, CausalLink[]>();
  for (const link of chain) {
    const parent = link.derivesFrom;
    if (!childrenMap.has(parent)) childrenMap.set(parent, []);
    childrenMap.get(parent)!.push(link);
  }

  // Compute own trust per link
  function computeOwnTrust(link: CausalLink): number {
    let trust = 0.5; // baseline

    // Source grounding
    const hasSourceRef = typeof link.sourceRef === 'number' && link.sourceRef > 0;
    const hasSrcInEvidence = typeof link.evidence === 'string' && /\[SRC-\d+\]/.test(link.evidence);
    if (hasSourceRef || hasSrcInEvidence) trust += 0.2;

    // Verbatim verification (T5)
    if (verbatimVerified && verbatimVerified.has(link.id)) {
      trust += 0.2;
    }

    // Temporal status: present_fact > active_mechanism > future_extrapolation
    if (link.temporalStatus === 'present_fact') trust += 0.1;
    else if (link.temporalStatus === 'active_mechanism') trust += 0.05;
    // future_extrapolation gets no bonus

    // Unsupported flag
    if (link.unsupported) trust -= 0.3;

    return Math.max(0.05, Math.min(1.0, trust));
  }

  // BFS from roots, propagating trust
  const visited = new Set<number>();
  const queue: Array<{ link: CausalLink; inheritedTrust: number }> = [];

  // Start with roots (derivesFrom: null) — they have full inherited trust
  const roots = childrenMap.get(null) || [];
  for (const root of roots) {
    queue.push({ link: root, inheritedTrust: 1.0 });
  }

  while (queue.length > 0) {
    const { link, inheritedTrust } = queue.shift()!;
    if (visited.has(link.id)) continue;
    visited.add(link.id);

    const ownTrust = computeOwnTrust(link);
    const finalTrust = Math.min(ownTrust, inheritedTrust);

    nodes.push({
      linkId: link.id,
      trust: ownTrust,
      inheritedTrust,
      finalTrust,
    });

    // Assign confidence tier
    let tier: ConfidenceTier;
    if (finalTrust >= 0.8) tier = 'ESTABLISHED';
    else if (finalTrust >= 0.6) tier = 'SUPPORTED';
    else if (finalTrust >= 0.4) tier = 'EMERGING';
    else tier = 'SPECULATIVE';
    tiers.set(link.id, tier);

    // Propagate to children: they inherit min(parent's finalTrust, 1.0)
    const children = childrenMap.get(link.id) || [];
    for (const child of children) {
      queue.push({ link: child, inheritedTrust: finalTrust });
    }
  }

  // Handle any unvisited links (shouldn't happen after orphan check, but safety)
  for (const link of chain) {
    if (!visited.has(link.id)) {
      const ownTrust = computeOwnTrust(link);
      nodes.push({ linkId: link.id, trust: ownTrust, inheritedTrust: 0.3, finalTrust: Math.min(ownTrust, 0.3) });
      tiers.set(link.id, 'SPECULATIVE');
    }
  }

  // Overall trust = average of finalTrust weighted by position (roots weigh more)
  const sortedNodes = [...nodes].sort((a, b) => a.linkId - b.linkId);
  let weightedSum = 0;
  let weightTotal = 0;
  for (const node of sortedNodes) {
    const weight = 1 / (sortedNodes.indexOf(node) + 1); // earlier links weigh more
    weightedSum += node.finalTrust * weight;
    weightTotal += weight;
  }
  const overall = weightTotal > 0 ? weightedSum / weightTotal : 0.5;

  return { nodes, tiers, overall: Math.round(overall * 100) / 100 };
}

// ============================================================================
// MAIN: runAllPruningGates — executes all gates in economic order
// ============================================================================

export function runAllPruningGates(
  analysis: AnalysisOutput,
  sourceCount: number,
  options?: {
    mechanismDomains?: Map<number, string>;
    mechanismDirections?: Map<number, 'positive' | 'negative' | 'reversing' | 'unclear'>;
    verbatimVerified?: Set<number>;
  }
): PruningResult {
  let chain = [...(analysis.causalChain || [])];
  const removed: PrunedLink[] = [];
  const warnings: string[] = [];

  // Gate 1: Citation sanitize (cheapest — string regex)
  const g1 = gateCitationSanitize(chain, sourceCount);
  chain = g1.chain;
  if (g1.removed > 0) warnings.push(`Citation sanitize: ${g1.removed} invalid [SRC-N] removed`);

  // Gate 2: Cascade check (graph traversal — cheap)
  const g2 = gateCascadeCheck(chain);
  chain = g2.chain;
  for (const d of g2.details) warnings.push(`Cascade: ${d}`);

  // Gate 3: Orphan check (graph traversal — cheap)
  const g3 = gateOrphanCheck(chain);
  chain = g3.chain;
  for (const r of g3.removed) removed.push({ link: r, reason: 'orphaned', gate: 'ORPHAN' });
  for (const d of g3.details) warnings.push(`Orphan: ${d}`);

  // Gate 4: Multi-root check (graph traversal — cheap)
  const g4 = gateMultiRootCheck(chain);
  chain = g4.chain;
  for (const r of g4.removed) removed.push({ link: r, reason: 'multi-root', gate: 'MULTI_ROOT' });
  for (const d of g4.details) warnings.push(`Multi-root: ${d}`);

  // Gate 5: Grounding check (string regex — moderate)
  const g5 = gateGroundingCheck(chain);
  chain = g5.chain;
  for (const r of g5.removed) removed.push({ link: r, reason: 'ungrounded', gate: 'GROUNDING' });
  for (const d of g5.details) warnings.push(`Grounding: ${d}`);

  // Gate 6: Domain travel (warning only)
  if (options?.mechanismDomains) {
    const g6 = gateDomainTravelCheck(chain, options.mechanismDomains);
    warnings.push(...g6.warnings);
  }

  // Gate 7: Inflection (warning only)
  if (options?.mechanismDirections) {
    const g7 = gateInflectionCheck(chain, options.mechanismDirections);
    warnings.push(...g7.warnings);
  }

  // Trust propagation
  const trust = propagateTrust(chain, options?.verbatimVerified);

  // T7: Gate 8: Hedging strip on verdict — write cleaned result back
  if (analysis.verdict) {
    const g8 = gateHedgingStrip(analysis.verdict);
    if (g8.modified) {
      warnings.push(`Hedging: ${g8.hedgeCount} hedge phrases stripped from verdict`);
      analysis.verdict = g8.cleaned;
    }
  }

  return {
    prunedChain: chain,
    removed,
    warnings,
    trustPropagation: trust.nodes,
    confidenceTiers: trust.tiers,
    overallTrust: trust.overall,
  };
}
