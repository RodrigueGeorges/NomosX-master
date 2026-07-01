/**
 * NomosX PhD COLLABORATIVE DELIBERATION — Expert-to-Expert Debate
 *
 * This is what separates NomosX from every other AI analysis tool:
 * Instead of just collecting individual expert opinions, we make them
 * ARGUE WITH EACH OTHER — exactly like a real academic seminar.
 *
 * Architecture:
 * 1. ROUND 1 — Individual analyses (existing PhD pipeline)
 * 2. ROUND 2 — Cross-examination: each expert reads others' findings
 *    and identifies disagreements, blind spots, and complementary insights
 * 3. ROUND 3 — Synthesis: experts revise their positions after seeing challenges
 * 4. CONSENSUS REPORT — Final unified position with explicit dissent
 *
 * This produces richer analysis because:
 * - Economists challenge technologists on implementation costs
 * - Security experts challenge policy experts on enforcement
 * - Quantitative experts challenge qualitative claims
 * - Dissent is preserved, not flattened
 *
 * Inspired by: Delphi method, Oxford-style debates, RAND war games
 */

import { callLLM } from '../llm/unified-llm';
import type { DomainExpertise, ExpertAnalysis } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface DeliberationChallenge {
  challengerId: DomainExpertise;
  challengerName: string;
  targetId: DomainExpertise;
  targetName: string;
  challengeType: 'disagreement' | 'blind_spot' | 'complementary' | 'methodological' | 'missing_evidence';
  claim: string;
  argument: string;
  severity: 'critical' | 'significant' | 'minor';
  suggestedRevision?: string;
}

export interface RevisedPosition {
  expertId: DomainExpertise;
  expertName: string;
  originalConfidence: number;
  revisedConfidence: number;
  concessions: string[];        // What they conceded after debate
  reinforcements: string[];     // What they now hold more strongly
  newInsights: string[];        // New ideas from cross-pollination
  remainingDissent: string[];   // Where they still disagree
}

export interface DeliberationResult {
  question: string;

  // Round 2 output
  challenges: DeliberationChallenge[];
  totalChallenges: number;
  criticalChallenges: number;

  // Round 3 output
  revisedPositions: RevisedPosition[];
  consensusPoints: string[];
  activeDisagreements: string[];
  emergentInsights: string[];    // New ideas that emerged from debate

  // Quality metrics
  deliberationDepth: number;     // 0-100: how substantive was the debate?
  consensusLevel: number;        // 0-100: how much agreement after debate?
  positionShift: number;         // Average confidence change (absolute)

  costUsd: number;
  durationMs: number;
}

// ============================================================================
// ROUND 2: CROSS-EXAMINATION
// ============================================================================

/**
 * Each expert reads others' analyses and generates challenges.
 * We pair experts strategically: economists vs technologists, policy vs security, etc.
 */
async function runCrossExamination(
  question: string,
  analyses: ExpertAnalysis[],
): Promise<{ challenges: DeliberationChallenge[]; costUsd: number }> {
  if (analyses.length < 2) {
    return { challenges: [], costUsd: 0 };
  }

  // Strategic pairing: maximize productive disagreement
  const pairs = generateChallengePairs(analyses);
  let totalCost = 0;

  console.log(`[DELIBERATION] Round 2: ${pairs.length} cross-examination pairs`);

  // Run challenges in parallel (batch of pairs)
  const challengeResults = await Promise.allSettled(
    pairs.map(async ([challenger, target]) => {
      const otherFindings = analyses
        .filter(a => a.expertId !== challenger.expertId)
        .map(a => `[${a.expertName}] (confidence: ${a.confidence}%)\nFindings: ${a.keyFindings.slice(0, 3).join('; ')}\nMethodology critique: ${a.methodology_critique.slice(0, 200)}`)
        .join('\n\n');

      const response = await callLLM({
        messages: [
          {
            role: 'system',
            content: `You are ${challenger.expertName}, participating in an academic deliberation. Your task is to critically examine another expert's analysis and identify where you disagree, what they missed, or where their reasoning is flawed. Be constructive but rigorous — like a peer reviewer at a top journal.`,
          },
          {
            role: 'user',
            content: `RESEARCH QUESTION: "${question}"

YOUR ANALYSIS (${challenger.expertName}, confidence: ${challenger.confidence}%):
Key findings: ${challenger.keyFindings.slice(0, 4).join('; ')}
Methodology critique: ${challenger.methodology_critique.slice(0, 300)}

TARGET EXPERT (${target.expertName}, confidence: ${target.confidence}%):
Key findings: ${target.keyFindings.slice(0, 4).join('; ')}
Methodology critique: ${target.methodology_critique.slice(0, 300)}
Blind spots: ${(target.blind_spots || []).slice(0, 3).join('; ')}

OTHER EXPERTS' POSITIONS:
${otherFindings}

Generate 2-4 challenges. For each, specify:
1. What specific claim or position you challenge
2. Your argument (with evidence from YOUR domain expertise)
3. Whether this is a disagreement, blind spot, missing evidence, or methodological issue
4. Severity (critical = must address, significant = should address, minor = could improve)

Return JSON:
{
  "challenges": [
    {
      "challengeType": "disagreement|blind_spot|complementary|methodological|missing_evidence",
      "claim": "The specific claim being challenged",
      "argument": "Your detailed counter-argument",
      "severity": "critical|significant|minor",
      "suggestedRevision": "How the target should revise their position (optional)"
    }
  ]
}`,
          },
        ],
        temperature: 0.3,
        maxTokens: 1500,
        jsonMode: true,
        enableCache: true,
        task: 'elenchus',
      });

      totalCost += response.costUsd;

      try {
        const parsed = JSON.parse(response.content);
        return (parsed.challenges || []).map((c: any) => ({
          challengerId: challenger.expertId,
          challengerName: challenger.expertName,
          targetId: target.expertId,
          targetName: target.expertName,
          challengeType: c.challengeType || 'disagreement',
          claim: c.claim || '',
          argument: c.argument || '',
          severity: c.severity || 'minor',
          suggestedRevision: c.suggestedRevision,
        })) as DeliberationChallenge[];
      } catch {
        return [] as DeliberationChallenge[];
      }
    })
  );

  const allChallenges: DeliberationChallenge[] = [];
  for (const result of challengeResults) {
    if (result.status === 'fulfilled') {
      allChallenges.push(...result.value);
    }
  }

  console.log(`[DELIBERATION] Round 2 complete: ${allChallenges.length} challenges generated`);
  return { challenges: allChallenges, costUsd: totalCost };
}

// ============================================================================
// ROUND 3: POSITION REVISION
// ============================================================================

/**
 * Each expert reads the challenges directed at them and revises their position.
 * This forces intellectual honesty: concede valid points, defend strong ones.
 */
async function runPositionRevision(
  question: string,
  analyses: ExpertAnalysis[],
  challenges: DeliberationChallenge[],
): Promise<{ positions: RevisedPosition[]; costUsd: number }> {
  let totalCost = 0;

  // Group challenges by target expert
  const challengesByTarget = new Map<DomainExpertise, DeliberationChallenge[]>();
  for (const ch of challenges) {
    const list = challengesByTarget.get(ch.targetId) || [];
    list.push(ch);
    challengesByTarget.set(ch.targetId, list);
  }

  // Only ask experts who received challenges to revise
  const expertsToRevise = analyses.filter(a => challengesByTarget.has(a.expertId));
  console.log(`[DELIBERATION] Round 3: ${expertsToRevise.length} experts revising positions`);

  const revisionResults = await Promise.allSettled(
    expertsToRevise.map(async (expert) => {
      const myChallenges = challengesByTarget.get(expert.expertId) || [];

      const challengeText = myChallenges
        .map((c, i) => `Challenge ${i + 1} from ${c.challengerName} [${c.severity}]:
Type: ${c.challengeType}
Claim challenged: ${c.claim}
Argument: ${c.argument}
${c.suggestedRevision ? `Suggested revision: ${c.suggestedRevision}` : ''}`)
        .join('\n\n');

      const response = await callLLM({
        messages: [
          {
            role: 'system',
            content: `You are ${expert.expertName}. You have received critical feedback from your peers in this deliberation. You must now honestly revise your position. Academic integrity demands that you concede valid points — but also defend positions where the challenge is weak.`,
          },
          {
            role: 'user',
            content: `RESEARCH QUESTION: "${question}"

YOUR ORIGINAL ANALYSIS (confidence: ${expert.confidence}%):
Key findings: ${expert.keyFindings.join('; ')}
Blind spots: ${(expert.blind_spots || []).join('; ')}

CHALLENGES FROM PEERS:
${challengeText}

After considering these challenges, respond with:
1. CONCESSIONS: What valid points do you concede? (Be honest)
2. REINFORCEMENTS: What positions do you now hold MORE strongly after reflection?
3. NEW INSIGHTS: What new ideas emerged from this cross-disciplinary debate?
4. REMAINING DISSENT: Where do you still disagree with your challengers? Why?
5. REVISED CONFIDENCE: Your new confidence level (0-100) after this deliberation

Return JSON:
{
  "revisedConfidence": 0-100,
  "concessions": ["What you now agree was wrong or incomplete"],
  "reinforcements": ["What you now hold more strongly"],
  "newInsights": ["Novel ideas from cross-pollination"],
  "remainingDissent": ["Where you still disagree and why"]
}`,
          },
        ],
        temperature: 0.2,
        maxTokens: 1200,
        jsonMode: true,
        enableCache: true,
        task: 'auto_revision',
      });

      totalCost += response.costUsd;

      try {
        const parsed = JSON.parse(response.content);
        return {
          expertId: expert.expertId,
          expertName: expert.expertName,
          originalConfidence: expert.confidence,
          revisedConfidence: parsed.revisedConfidence ?? expert.confidence,
          concessions: parsed.concessions || [],
          reinforcements: parsed.reinforcements || [],
          newInsights: parsed.newInsights || [],
          remainingDissent: parsed.remainingDissent || [],
        } as RevisedPosition;
      } catch {
        return {
          expertId: expert.expertId,
          expertName: expert.expertName,
          originalConfidence: expert.confidence,
          revisedConfidence: expert.confidence,
          concessions: [],
          reinforcements: [],
          newInsights: [],
          remainingDissent: [],
        } as RevisedPosition;
      }
    })
  );

  const positions: RevisedPosition[] = [];
  for (const result of revisionResults) {
    if (result.status === 'fulfilled') {
      positions.push(result.value);
    }
  }

  console.log(`[DELIBERATION] Round 3 complete: ${positions.length} positions revised`);
  return { positions, costUsd: totalCost };
}

// ============================================================================
// CONSENSUS EXTRACTION
// ============================================================================

async function extractConsensus(
  question: string,
  challenges: DeliberationChallenge[],
  revisedPositions: RevisedPosition[],
): Promise<{ consensusPoints: string[]; activeDisagreements: string[]; emergentInsights: string[]; costUsd: number }> {

  const positionSummary = revisedPositions.map(p =>
    `${p.expertName}: confidence ${p.originalConfidence}→${p.revisedConfidence}%
Concessions: ${p.concessions.slice(0, 2).join('; ') || 'none'}
Reinforcements: ${p.reinforcements.slice(0, 2).join('; ') || 'none'}
New insights: ${p.newInsights.slice(0, 2).join('; ') || 'none'}
Remaining dissent: ${p.remainingDissent.slice(0, 2).join('; ') || 'none'}`
  ).join('\n\n');

  const response = await callLLM({
    messages: [
      {
        role: 'system',
        content: 'You are the synthesis director of a multi-expert deliberation. Extract the final consensus, active disagreements, and novel insights that emerged from the debate. Be precise and actionable.',
      },
      {
        role: 'user',
        content: `QUESTION: "${question}"

DELIBERATION RESULTS (${revisedPositions.length} experts, ${challenges.length} challenges):
${positionSummary}

Extract:
1. CONSENSUS: Points where ALL experts now agree (after debate)
2. ACTIVE DISAGREEMENTS: Points where experts still disagree (with who disagrees)
3. EMERGENT INSIGHTS: Novel ideas that ONLY emerged from cross-disciplinary debate

Return JSON:
{
  "consensusPoints": ["Point all experts agree on"],
  "activeDisagreements": ["Specific disagreement with expert names"],
  "emergentInsights": ["Novel cross-disciplinary insight"]
}`,
      },
    ],
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
    enableCache: true,
    task: 'meta_analysis',
  });

  try {
    const parsed = JSON.parse(response.content);
    return {
      consensusPoints: parsed.consensusPoints || [],
      activeDisagreements: parsed.activeDisagreements || [],
      emergentInsights: parsed.emergentInsights || [],
      costUsd: response.costUsd,
    };
  } catch {
    return { consensusPoints: [], activeDisagreements: [], emergentInsights: [], costUsd: response.costUsd };
  }
}

// ============================================================================
// STRATEGIC PAIRING — Maximize productive disagreement
// ============================================================================

function generateChallengePairs(analyses: ExpertAnalysis[]): [ExpertAnalysis, ExpertAnalysis][] {
  // Strategic cross-domain pairings that produce the best debates
  const PRODUCTIVE_PAIRS: [DomainExpertise, DomainExpertise][] = [
    ['economics', 'technology'],        // Cost vs innovation tension
    ['economics', 'environment'],       // Growth vs sustainability
    ['policy', 'security'],             // Regulation vs enforcement
    ['technology', 'law'],              // Innovation vs regulation
    ['health', 'economics'],            // Health costs vs economic impact
    ['security', 'technology'],         // Threat landscape vs tech solutions
    ['quantitative', 'policy'],         // Data rigor vs political feasibility
    ['environment', 'energy-advanced'], // Climate vs energy transition
    ['finance', 'economics'],           // Market view vs macro view
    ['geopolitics', 'security'],        // Diplomacy vs defense
    ['social-sciences', 'technology'],  // Social impact vs tech progress
    ['law', 'policy'],                  // Legal frameworks vs political will
    ['behavioral-economics', 'economics'], // Behavioral vs rational models
    ['complexity-science', 'quantitative'], // Complex systems vs statistical models
  ];

  const pairs: [ExpertAnalysis, ExpertAnalysis][] = [];
  const analysisMap = new Map<DomainExpertise, ExpertAnalysis>();

  for (const analysis of analyses) {
    analysisMap.set(analysis.expertId as DomainExpertise, analysis);
  }

  // First: strategic pairs
  for (const [domain1, domain2] of PRODUCTIVE_PAIRS) {
    const a1 = analysisMap.get(domain1);
    const a2 = analysisMap.get(domain2);
    if (a1 && a2) {
      pairs.push([a1, a2]);
    }
  }

  // If we have too few strategic pairs, add confidence-gap pairs
  // (expert with high confidence challenges expert with low confidence)
  if (pairs.length < 3 && analyses.length >= 2) {
    const sorted = [...analyses].sort((a, b) => b.confidence - a.confidence);
    const high = sorted[0];
    const low = sorted[sorted.length - 1];
    if (high.expertId !== low.expertId && !pairs.some(([a, b]) =>
      (a.expertId === high.expertId && b.expertId === low.expertId) ||
      (a.expertId === low.expertId && b.expertId === high.expertId)
    )) {
      pairs.push([high, low]);
    }
  }

  // Cap at 8 pairs to control costs
  return pairs.slice(0, 8);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run collaborative deliberation after individual PhD analyses.
 * This is called AFTER runExpertCouncil / runLoadBalancedCouncil.
 *
 * @param question - The research question
 * @param analyses - Individual expert analyses (from Round 1)
 * @returns DeliberationResult with challenges, revised positions, and consensus
 */
export async function runCollaborativeDeliberation(
  question: string,
  analyses: ExpertAnalysis[],
): Promise<DeliberationResult> {
  const start = Date.now();
  console.log(`\n${'━'.repeat(80)}`);
  console.log(`  🎓 PhD COLLABORATIVE DELIBERATION — ${analyses.length} experts debating`);
  console.log(`  Question: "${question.slice(0, 80)}..."`);
  console.log(`${'━'.repeat(80)}\n`);

  if (analyses.length < 2) {
    console.log('[DELIBERATION] Only 1 expert — skipping deliberation');
    return emptyResult(question, Date.now() - start);
  }

  let totalCost = 0;

  // ── ROUND 2: Cross-Examination ──
  const { challenges, costUsd: crossCost } = await runCrossExamination(question, analyses);
  totalCost += crossCost;

  if (challenges.length === 0) {
    console.log('[DELIBERATION] No challenges generated — experts agree');
    return {
      question,
      challenges: [],
      totalChallenges: 0,
      criticalChallenges: 0,
      revisedPositions: [],
      consensusPoints: analyses.flatMap(a => a.keyFindings.slice(0, 2)),
      activeDisagreements: [],
      emergentInsights: [],
      deliberationDepth: 30,
      consensusLevel: 90,
      positionShift: 0,
      costUsd: totalCost,
      durationMs: Date.now() - start,
    };
  }

  // P1-PERF: Early exit if challenges are only minor — skip expensive Round 3
  const earlyCriticalCount = challenges.filter(c => c.severity === 'critical').length;
  const earlySignificantCount = challenges.filter(c => c.severity === 'significant').length;
  if (earlyCriticalCount === 0 && earlySignificantCount <= 1) {
    console.log(`[DELIBERATION] EARLY EXIT: ${challenges.length} challenges but only ${earlySignificantCount} significant, 0 critical — consensus is high, skipping Round 3`);
    return {
      question,
      challenges,
      totalChallenges: challenges.length,
      criticalChallenges: 0,
      revisedPositions: [],
      consensusPoints: analyses.flatMap(a => a.keyFindings.slice(0, 2)),
      activeDisagreements: challenges.filter(c => c.severity === 'significant').map(c => `${c.challengerName} challenges ${c.targetName}: ${c.claim}`),
      emergentInsights: [],
      deliberationDepth: 40,
      consensusLevel: 85,
      positionShift: 0,
      costUsd: totalCost,
      durationMs: Date.now() - start,
    };
  }

  // ── ROUND 3: Position Revision ──
  const { positions, costUsd: revisionCost } = await runPositionRevision(question, analyses, challenges);
  totalCost += revisionCost;

  // ── CONSENSUS EXTRACTION ──
  const { consensusPoints, activeDisagreements, emergentInsights, costUsd: consensusCost } = await extractConsensus(question, challenges, positions);
  totalCost += consensusCost;

  // ── QUALITY METRICS ──
  const criticalChallenges = challenges.filter(c => c.severity === 'critical').length;
  const avgShift = positions.length > 0
    ? positions.reduce((sum, p) => sum + Math.abs(p.revisedConfidence - p.originalConfidence), 0) / positions.length
    : 0;
  const avgRevisedConfidence = positions.length > 0
    ? positions.reduce((sum, p) => sum + p.revisedConfidence, 0) / positions.length
    : 50;

  const deliberationDepth = Math.min(100, Math.round(
    (challenges.length * 10) +
    (criticalChallenges * 15) +
    (positions.filter(p => p.concessions.length > 0).length * 10) +
    (emergentInsights.length * 10)
  ));

  const consensusLevel = Math.round(
    100 - (activeDisagreements.length * 15) + (consensusPoints.length * 5)
  );

  const durationMs = Date.now() - start;

  console.log(`[DELIBERATION] ✅ Complete:`);
  console.log(`  Challenges: ${challenges.length} (${criticalChallenges} critical)`);
  console.log(`  Positions revised: ${positions.length}`);
  console.log(`  Avg confidence shift: ${avgShift.toFixed(1)} points`);
  console.log(`  Consensus points: ${consensusPoints.length}`);
  console.log(`  Active disagreements: ${activeDisagreements.length}`);
  console.log(`  Emergent insights: ${emergentInsights.length}`);
  console.log(`  Depth: ${deliberationDepth}/100 | Consensus: ${Math.max(0, Math.min(100, consensusLevel))}/100`);
  console.log(`  Cost: $${totalCost.toFixed(4)} | Duration: ${durationMs}ms`);

  return {
    question,
    challenges,
    totalChallenges: challenges.length,
    criticalChallenges,
    revisedPositions: positions,
    consensusPoints,
    activeDisagreements,
    emergentInsights,
    deliberationDepth,
    consensusLevel: Math.max(0, Math.min(100, consensusLevel)),
    positionShift: avgShift,
    costUsd: totalCost,
    durationMs,
  };
}

// ============================================================================
// BUILD DELIBERATION CONTEXT BLOCK — For injection into final analysis
// ============================================================================

/**
 * Build a text block summarizing the deliberation for the ANALYST/EDITOR.
 * This ensures the final publication reflects the debate, not just one opinion.
 */
export function buildDeliberationContextBlock(result: DeliberationResult): string {
  if (result.totalChallenges === 0) return '';

  const lines: string[] = [];
  lines.push('=== EXPERT DELIBERATION RESULTS ===');
  lines.push(`${result.revisedPositions.length} experts debated, ${result.totalChallenges} challenges exchanged\n`);

  if (result.consensusPoints.length > 0) {
    lines.push('✅ CONSENSUS (all experts agree):');
    for (const point of result.consensusPoints.slice(0, 5)) {
      lines.push(`  • ${point}`);
    }
    lines.push('');
  }

  if (result.activeDisagreements.length > 0) {
    lines.push('⚖️ ACTIVE DISAGREEMENTS (unresolved after debate):');
    for (const d of result.activeDisagreements.slice(0, 4)) {
      lines.push(`  • ${d}`);
    }
    lines.push('');
  }

  if (result.emergentInsights.length > 0) {
    lines.push('💡 EMERGENT INSIGHTS (new ideas from cross-disciplinary debate):');
    for (const insight of result.emergentInsights.slice(0, 4)) {
      lines.push(`  • ${insight}`);
    }
    lines.push('');
  }

  // Show significant concessions
  const concessions = result.revisedPositions.flatMap(p =>
    p.concessions.map(c => `${p.expertName}: ${c}`)
  );
  if (concessions.length > 0) {
    lines.push('🔄 KEY CONCESSIONS (positions changed after debate):');
    for (const c of concessions.slice(0, 4)) {
      lines.push(`  • ${c}`);
    }
    lines.push('');
  }

  lines.push(`Deliberation depth: ${result.deliberationDepth}/100 | Consensus: ${result.consensusLevel}/100`);
  lines.push('=== END DELIBERATION ===');

  return lines.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function emptyResult(question: string, durationMs: number): DeliberationResult {
  return {
    question,
    challenges: [],
    totalChallenges: 0,
    criticalChallenges: 0,
    revisedPositions: [],
    consensusPoints: [],
    activeDisagreements: [],
    emergentInsights: [],
    deliberationDepth: 0,
    consensusLevel: 100,
    positionShift: 0,
    costUsd: 0,
    durationMs,
  };
}
