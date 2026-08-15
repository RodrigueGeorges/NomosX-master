/**
 * Adversarial Self-Play — NomosX
 *
 * Le système génère ses propres cas de test difficiles et essaie de
 * trouver des faiblesses dans ses propres analyses. C'est le pattern
 * qui crée le moat le plus défensif : le système découvre ses
 * faiblesses avant les utilisateurs.
 *
 * Inspiré de :
 * - AlphaGo self-play (Silver et al., 2016-2024)
 * - Red-teaming + automated adversarial testing (2024-2026)
 * - Constitutional AI's self-critique loop
 * - "Scalable Oversight" (Anthropic/DeepMind 2026)
 *
 * Architecture :
 * 1. GENERATOR — génère des queries adversariales difficiles
 *    (queries avec contradictions internes, biais subtils, sujets
 *    controversés, edge cases méthodologiques)
 * 2. ATTACKER — prend une analyse produite et essaie de trouver
 *    des faiblesses (claims non sourcés, biais, erreurs logiques,
 *    omissions critiques)
 * 3. DEFENDER — l'analyste doit répondre aux attaques
 * 4. JUDGE — évalue si le défenseur a réussi à répondre
 *
 * Le résultat : une liste de faiblesses trouvées + des leçons
 * qui sont injectées dans les runs futurs.
 */

import { callLLM } from '../../llm/unified-llm';
import { parseJson } from '../json-utils';
import { prisma } from '../../db';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AdversarialRole = 'generator' | 'attacker' | 'defender' | 'judge';

export interface AdversarialQuery {
  id: string;
  query: string;
  /** Why this query is challenging */
  challengeType: ChallengeType;
  /** What weakness it's designed to expose */
  targetWeakness: string;
  /** Expected difficulty (0-1) */
  difficulty: number;
  /** Domain */
  domain: string;
  timestamp: number;
}

export type ChallengeType =
  | 'internal_contradiction'    // Query contains contradictory premises
  | 'subtle_bias'               // Query designed to elicit biased analysis
  | 'methodological_edge_case'  // Edge case in research methodology
  | 'controversial_topic'       // Highly polarized topic
  | 'sparse_evidence'           // Topic with very little research
  | 'conflicting_sources'       // Sources that directly contradict each other
  | 'temporal_shift'            // Recent paradigm shift invalidates older sources
  | 'false_premise'             // Query contains a false premise
  | 'overspecification'         // Query is too narrow to find sources
  | 'domain_boundary'           // Cross-domain query that requires synthesis
  ;

export interface AttackVector {
  id: string;
  /** Which part of the analysis is attacked */
  target: AttackTarget;
  /** The specific attack */
  attack: string;
  /** Evidence supporting the attack */
  evidence: string;
  /** Severity (0-1) */
  severity: number;
  /** Category of weakness */
  weaknessCategory: WeaknessCategory;
}

export type AttackTarget =
  | 'claim'            // A specific factual claim
  | 'citation'         // A citation is wrong or missing
  | 'methodology'      // Methodological flaw
  | 'bias'             // Bias in the analysis
  | 'omission'         // Critical information omitted
  | 'logic'            // Logical error in reasoning
  | 'evidence_quality' // Evidence quality assessment is wrong
  | 'synthesis'        // Synthesis is flawed
  ;

export type WeaknessCategory =
  | 'hallucination'           // Fabricated claim
  | 'unsupported_claim'       // Claim without citation
  | 'cherry_picking'          // Only cited supportive sources
  | 'false_balance'           // Gave equal weight to unequal positions
  | 'temporal_bias'           // Ignored recent developments
  | 'geographic_bias'         // Western-centric or similar
  | 'methodological_ignorance'// Ignored methodological limitations
  | 'oversimplification'      // Reduced complex topic to simple narrative
  | 'missing_nuance'          // Lacked necessary nuance
  | 'circular_reasoning'      // Used conclusion as premise
  | 'appeal_to_authority'     // Relied on authority instead of evidence
  ;

export interface DefenseResponse {
  attackId: string;
  /** Whether the defender concedes or defends */
  response: 'concede' | 'defend' | 'partial';
  /** The defense argument */
  argument: string;
  /** Additional evidence provided */
  newEvidence?: string;
  /** Whether the defense is adequate */
  defenseQuality: number; // 0-1
}

export interface SelfPlayResult {
  queryId: string;
  query: string;
  attacks: AttackVector[];
  defenses: DefenseResponse[];
  /** Judge's verdict on each attack */
  verdicts: Array<{
    attackId: string;
    attackSucceeded: boolean; // true = the attack found a real weakness
    severity: number;
    lesson: string; // What the system should learn
  }>;
  /** Overall robustness score (0-1) */
  robustnessScore: number;
  /** Lessons learned (for injection into future runs) */
  lessons: SelfPlayLesson[];
  timestamp: number;
}

export interface SelfPlayLesson {
  category: WeaknessCategory;
  lesson: string;
  example: string;
  severity: number;
  /** How to avoid this in future runs */
  mitigation: string;
}

// ─── Generator: Create adversarial queries ──────────────────────────────────

/**
 * Generate adversarial test queries designed to expose system weaknesses.
 */
export async function generateAdversarialQueries(
  count: number = 5,
  domains: string[] = ['economics', 'climate', 'ai_policy', 'public_health', 'geopolitics'],
): Promise<AdversarialQuery[]> {
  const challengeTypes: ChallengeType[] = [
    'internal_contradiction', 'subtle_bias', 'methodological_edge_case',
    'controversial_topic', 'sparse_evidence', 'conflicting_sources',
    'temporal_shift', 'false_premise', 'overspecification', 'domain_boundary',
  ];

  const queries: AdversarialQuery[] = [];

  // Generate queries using LLM
  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are an adversarial test generator for a research AI system. Generate ${count} challenging research queries designed to expose weaknesses in AI research analysis.

Each query should target a specific weakness:
- internal_contradiction: Query with contradictory premises
- subtle_bias: Query designed to elicit biased analysis
- methodological_edge_case: Edge case in research methodology
- controversial_topic: Highly polarized topic
- sparse_evidence: Topic with very little research available
- conflicting_sources: Sources that directly contradict each other
- temporal_shift: Recent paradigm shift invalidates older sources
- false_premise: Query contains a false premise
- overspecification: Query too narrow to find sources
- domain_boundary: Cross-domain query requiring synthesis

Respond with JSON array:
[
  {
    "query": "the research question",
    "challengeType": "one of the types above",
    "targetWeakness": "what weakness this is designed to expose",
    "difficulty": 0.8,
    "domain": "economics"
  }
]

Make the queries realistic — they should look like genuine research questions that a user might ask, but contain hidden traps.`,
        },
        {
          role: 'user',
          content: `Generate ${count} adversarial queries across these domains: ${domains.join(', ')}. Make them varied in difficulty (mix of 0.3-0.9).`,
        },
      ],
      temperature: 0.8,
      jsonMode: true,
      maxTokens: 2000,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<AdversarialQuery[]>(response.content);
    if (parsed && Array.isArray(parsed)) {
      for (const q of parsed) {
        queries.push({
          id: `advq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          query: q.query,
          challengeType: q.challengeType,
          targetWeakness: q.targetWeakness,
          difficulty: q.difficulty ?? 0.5,
          domain: q.domain || 'general',
          timestamp: Date.now(),
        });
      }
    }
  } catch (err) {
    console.warn('[SelfPlay] Query generation failed:', err);
  }

  // Fallback: rule-based queries if LLM fails
  if (queries.length === 0) {
    queries.push(...generateFallbackQueries(count, domains));
  }

  return queries;
}

function generateFallbackQueries(count: number, domains: string[]): AdversarialQuery[] {
  const templates: Array<Omit<AdversarialQuery, 'id' | 'timestamp'>> = [
    {
      query: "What is the evidence that carbon taxes reduce inequality while also increasing economic growth?",
      challengeType: 'internal_contradiction',
      targetWeakness: 'System may not recognize the tension between reducing inequality and increasing growth',
      difficulty: 0.7,
      domain: 'economics',
    },
    {
      query: "Is AI regulation necessary given that all AI researchers agree it's safe?",
      challengeType: 'false_premise',
      targetWeakness: 'System may accept the false premise that all researchers agree AI is safe',
      difficulty: 0.6,
      domain: 'ai_policy',
    },
    {
      query: "What do all studies conclude about the optimal carbon price?",
      challengeType: 'overspecification',
      targetWeakness: 'System may fabricate consensus where none exists',
      difficulty: 0.5,
      domain: 'climate',
    },
    {
      query: "How does the 2026 paradigm shift in quantum biology affect older protein folding models?",
      challengeType: 'temporal_shift',
      targetWeakness: 'System may rely on outdated sources without recognizing paradigm shift',
      difficulty: 0.8,
      domain: 'public_health',
    },
    {
      query: "What are the geopolitical implications of rare earth element supply chains for both Western and Chinese strategic interests?",
      challengeType: 'subtle_bias',
      targetWeakness: 'System may show Western-centric bias in analyzing Chinese interests',
      difficulty: 0.7,
      domain: 'geopolitics',
    },
  ];

  return templates.slice(0, count).map(t => ({
    ...t,
    id: `advq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  }));
}

// ─── Attacker: Find weaknesses in an analysis ───────────────────────────────

/**
 * Given an analysis, generate attacks trying to find weaknesses.
 */
export async function attackAnalysis(
  query: string,
  analysis: string,
  sources: Array<{ id: string; title: string; abstract?: string }>,
): Promise<AttackVector[]> {
  const sourcesSummary = sources.map(s => `[${s.id}] ${s.title}`).join('\n');

  try {
    const response = await callLLM({
      messages: [
        {
          role: 'system',
          content: `You are a red-team attacker. Your job is to find weaknesses in a research analysis. Be aggressive but fair — only report real weaknesses, not stylistic preferences.

Attack categories:
- claim: A specific factual claim is wrong or unsupported
- citation: A citation is wrong, missing, or misattributed
- methodology: Methodological flaw in the analysis
- bias: Bias in source selection or interpretation
- omission: Critical information or perspective is missing
- logic: Logical error in reasoning
- evidence_quality: Evidence quality assessment is wrong
- synthesis: The synthesis is flawed or incomplete

Weakness categories:
- hallucination, unsupported_claim, cherry_picking, false_balance, temporal_bias,
  geographic_bias, methodological_ignorance, oversimplification, missing_nuance,
  circular_reasoning, appeal_to_authority

Respond with JSON array:
[
  {
    "target": "claim",
    "attack": "specific description of the weakness",
    "evidence": "why this is a weakness",
    "severity": 0.7,
    "weaknessCategory": "unsupported_claim"
  }
]

Find at least 3 and at most 7 weaknesses. Focus on the most severe ones.`,
        },
        {
          role: 'user',
          content: `Query: "${query}"

Sources available:
${sourcesSummary}

Analysis to attack:
${analysis.slice(0, 4000)}

Find weaknesses:`,
        },
      ],
      temperature: 0.4,
      jsonMode: true,
      maxTokens: 2000,
      task: 'enrichment_reasoner',
    });

    const parsed = parseJson<AttackVector[]>(response.content);
    if (parsed && Array.isArray(parsed)) {
      return parsed.map(a => ({
        ...a,
        id: `attack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      }));
    }
  } catch (err) {
    console.warn('[SelfPlay] Attack generation failed:', err);
  }

  return [];
}

// ─── Defender: Respond to attacks ───────────────────────────────────────────

/**
 * Given attacks on an analysis, attempt to defend or concede.
 */
export async function defendAnalysis(
  query: string,
  analysis: string,
  attacks: AttackVector[],
  sources: Array<{ id: string; title: string; abstract?: string }>,
): Promise<DefenseResponse[]> {
  const defenses: DefenseResponse[] = [];

  for (const attack of attacks) {
    try {
      const response = await callLLM({
        messages: [
          {
            role: 'system',
            content: `You are defending a research analysis against an attack. You must either:
- "concede": Acknowledge the attack is valid and the analysis has this weakness
- "defend": Show why the attack is wrong or the analysis already addresses it
- "partial": Partially concede but note mitigating factors

Be honest — if the attack is valid, concede. Respond with JSON:
{"response": "concede|defend|partial", "argument": "your response", "newEvidence": "optional new evidence", "defenseQuality": 0.7}`,
          },
          {
            role: 'user',
            content: `Query: "${query}"

Attack: ${attack.attack}
Evidence: ${attack.evidence}
Severity: ${attack.severity}
Category: ${attack.weaknessCategory}

Analysis (truncated):
${analysis.slice(0, 2000)}

Sources: ${sources.map(s => s.title).slice(0, 5).join(', ')}

Respond to the attack:`,
          },
        ],
        temperature: 0.3,
        jsonMode: true,
        maxTokens: 500,
        task: 'enrichment_reasoner',
      });

      const parsed = parseJson<{ response: 'concede' | 'defend' | 'partial'; argument: string; newEvidence?: string; defenseQuality: number }>(response.content);
      if (parsed) {
        defenses.push({
          attackId: attack.id,
          response: parsed.response,
          argument: parsed.argument,
          newEvidence: parsed.newEvidence,
          defenseQuality: parsed.defenseQuality ?? 0.5,
        });
      }
    } catch (err) {
      console.warn(`[SelfPlay] Defense for attack ${attack.id} failed:`, err);
    }
  }

  return defenses;
}

// ─── Judge: Evaluate the self-play round ────────────────────────────────────

/**
 * Judge whether each attack succeeded (found a real weakness)
 * or was successfully defended.
 */
export async function judgeSelfPlay(
  attacks: AttackVector[],
  defenses: DefenseResponse[],
): Promise<Array<{ attackId: string; attackSucceeded: boolean; severity: number; lesson: string }>> {
  const verdicts: Array<{ attackId: string; attackSucceeded: boolean; severity: number; lesson: string }> = [];

  for (const attack of attacks) {
    const defense = defenses.find(d => d.attackId === attack.id);

    // Simple rule: if defender concedes, attack succeeded
    let attackSucceeded = defense?.response === 'concede';
    let severity = attack.severity;

    // If partial, use defense quality to determine
    if (defense?.response === 'partial') {
      attackSucceeded = (defense.defenseQuality ?? 0.5) < 0.5;
      severity = attack.severity * (1 - (defense.defenseQuality ?? 0.5));
    }

    // If defender defends with high quality, attack failed
    if (defense?.response === 'defend' && (defense.defenseQuality ?? 0) > 0.7) {
      attackSucceeded = false;
      severity = attack.severity * 0.3;
    }

    // Generate lesson
    const lesson = attackSucceeded
      ? `Weakness found: ${attack.weaknessCategory} — ${attack.attack}. Mitigation: ${suggestMitigation(attack.weaknessCategory)}`
      : `Attack on ${attack.weaknessCategory} was defended — analysis is robust here`;

    verdicts.push({
      attackId: attack.id,
      attackSucceeded,
      severity,
      lesson,
    });
  }

  return verdicts;
}

function suggestMitigation(category: WeaknessCategory): string {
  const mitigations: Record<WeaknessCategory, string> = {
    hallucination: 'Verify every claim against source text. Use "non établie" for unsupported claims.',
    unsupported_claim: 'Require [SRC-N] citation for every factual claim. Reject uncited claims.',
    cherry_picking: 'Actively search for contradicting sources. Include them in the analysis.',
    false_balance: 'Weight positions by evidence quality, not by number of supporters.',
    temporal_bias: 'Prioritize sources from last 3 years. Flag outdated sources explicitly.',
    geographic_bias: 'Include non-Western sources. Search in multiple languages when possible.',
    methodological_ignorance: 'Always discuss methodological limitations of cited studies.',
    oversimplification: "Acknowledge complexity. Use \"d'une part... d'autre part\" structure.",
    missing_nuance: 'Add nuance sections. Use hedging language for uncertain claims.',
    circular_reasoning: 'Check that conclusions don\'t appear in premises. Trace logical chains.',
    appeal_to_authority: 'Cite evidence, not just authority. "Smith (2024) found X" not "Smith says X".',
  };
  return mitigations[category] || 'Review and strengthen this aspect of the analysis.';
}

// ─── Full Self-Play Round ───────────────────────────────────────────────────

/**
 * Run a complete self-play round:
 * 1. Generate adversarial query (or use provided one)
 * 2. Run the pipeline (caller provides the analysis)
 * 3. Attack the analysis
 * 4. Defend against attacks
 * 5. Judge the round
 * 6. Extract lessons
 */
export async function runSelfPlayRound(
  query: string,
  analysis: string,
  sources: Array<{ id: string; title: string; abstract?: string }>,
  options: { queryId?: string; challengeType?: ChallengeType } = {},
): Promise<SelfPlayResult> {
  const queryId = options.queryId || `sp_${Date.now()}`;
  console.log(`[SelfPlay] Starting round for query: "${query.slice(0, 60)}..."`);

  // Step 1: Attack
  console.log('[SelfPlay] Phase 1: Attacking analysis...');
  const attacks = await attackAnalysis(query, analysis, sources);
  console.log(`[SelfPlay] Generated ${attacks.length} attacks`);

  if (attacks.length === 0) {
    return {
      queryId,
      query,
      attacks: [],
      defenses: [],
      verdicts: [],
      robustnessScore: 1.0,
      lessons: [],
      timestamp: Date.now(),
    };
  }

  // Step 2: Defend
  console.log('[SelfPlay] Phase 2: Defending against attacks...');
  const defenses = await defendAnalysis(query, analysis, attacks, sources);
  console.log(`[SelfPlay] Generated ${defenses.length} defenses`);

  // Step 3: Judge
  console.log('[SelfPlay] Phase 3: Judging...');
  const verdicts = await judgeSelfPlay(attacks, defenses);

  // Step 4: Extract lessons
  const succeededAttacks = verdicts.filter(v => v.attackSucceeded);
  const lessons: SelfPlayLesson[] = succeededAttacks.map(v => {
    const attack = attacks.find(a => a.id === v.attackId)!;
    return {
      category: attack.weaknessCategory,
      lesson: v.lesson,
      example: attack.attack,
      severity: v.severity,
      mitigation: suggestMitigation(attack.weaknessCategory),
    };
  });

  // Robustness score = 1 - (weighted severity of succeeded attacks)
  const totalSeverity = succeededAttacks.reduce((s, v) => s + v.severity, 0);
  const robustnessScore = Math.max(0, 1 - totalSeverity / attacks.length);

  const result: SelfPlayResult = {
    queryId,
    query,
    attacks,
    defenses,
    verdicts,
    robustnessScore,
    lessons,
    timestamp: Date.now(),
  };

  console.log(`[SelfPlay] Round complete: ${succeededAttacks.length}/${attacks.length} attacks succeeded, robustness=${robustnessScore.toFixed(2)}`);

  // Persist
  await persistSelfPlayResult(result);

  return result;
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function persistSelfPlayResult(result: SelfPlayResult): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        agent: 'self_play',
        action: 'SELF_PLAY_ROUND',
        metadata: JSON.stringify({
          queryId: result.queryId,
          query: result.query.slice(0, 200),
          attackCount: result.attacks.length,
          succeededAttacks: result.verdicts.filter(v => v.attackSucceeded).length,
          robustnessScore: result.robustnessScore,
          lessons: result.lessons,
          attacks: result.attacks.map(a => ({
            target: a.target,
            attack: a.attack,
            weaknessCategory: a.weaknessCategory,
            severity: a.severity,
          })),
          timestamp: result.timestamp,
        }),
      },
    });
  } catch (err) {
    console.warn('[SelfPlay] Failed to persist result:', err);
  }
}

// ─── Get past self-play lessons for injection ───────────────────────────────

/**
 * Get lessons from past self-play rounds to inject into future runs.
 * This is how the adversarial training feeds back into the pipeline.
 */
export async function getSelfPlayLessons(
  options: { lookbackDays?: number; maxLessons?: number; minSeverity?: number } = {},
): Promise<SelfPlayLesson[]> {
  const { lookbackDays = 30, maxLessons = 5, minSeverity = 0.3 } = options;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const records = await prisma.agentAuditLog.findMany({
      where: {
        agent: 'self_play',
        action: 'SELF_PLAY_ROUND',
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    const allLessons: SelfPlayLesson[] = [];
    for (const record of records) {
      try {
        const m = JSON.parse(record.metadata || '{}');
        if (m.lessons) {
          allLessons.push(...m.lessons.filter((l: SelfPlayLesson) => l.severity >= minSeverity));
        }
      } catch {}
    }

    // Deduplicate by category + lesson
    const seen = new Set<string>();
    const unique = allLessons.filter(l => {
      const key = `${l.category}:${l.lesson.slice(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by severity (descending)
    return unique.sort((a, b) => b.severity - a.severity).slice(0, maxLessons);
  } catch (err) {
    console.warn('[SelfPlay] Failed to load lessons:', err);
    return [];
  }
}

/**
 * Build a context block from self-play lessons for injection into pipeline prompts.
 */
export async function buildSelfPlayInjection(): Promise<string> {
  const lessons = await getSelfPlayLessons({ maxLessons: 5, minSeverity: 0.4 });

  if (lessons.length === 0) return '';

  const parts: string[] = ['## ADVERSARIAL SELF-PLAY — Known weaknesses to avoid'];

  for (const lesson of lessons) {
    parts.push(`- [${lesson.category}] ${lesson.mitigation}`);
  }

  return parts.join('\n');
}
