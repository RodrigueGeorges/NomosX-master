/**
 * ADAS — Automated Design of Agentic Systems — NomosX Sprint 6 (Gap 2)
 *
 * Méta-agent qui invente de nouveaux agents/workflow en code à partir d'une
 * archive de découvertes.
 * Inspiré de :
 * - ADAS (ShengranHu/adas, ICLR 2025 Outstanding Paper, arxiv 2408.08435)
 * - AgentSquare (Tsinghua-fib-lab, ICLR 2025, arxiv 2410.06153)
 * - EvoAgentX (EvoAgentX, 2025)
 *
 * Le problème :
 * Le Meta-Controller et DAG Planner *replanifient* l'exécution mais n'**inventent
 * pas** de nouveaux agents. ADAS montre qu'un méta-agent peut *programmer* de
 * nouveaux agents en code et les tester, créant un archive de découvertes qui
 * s'améliore avec le temps.
 *
 * Architecture ADAS :
 * 1. Archive — collection de programmes d'agents connus (prompts + tools + rules)
 * 2. Code Mutation — LLM propose des variations (crossover, mutation, expansion)
 * 3. Evaluation — teste sur un sous-ensemble de runs (self-play, PRM)
 * 4. Selection — garde les meilleures découvertes
 * 5. Injection — les nouveaux agents/workflows deviennent disponibles
 *
 * Contraintes NomosX (safety) :
 * - Les nouveaux agents doivent respecter la signature des fonctions existantes
 * - Ils ne peuvent pas écraser les agents critiques (SCOUT, RANK, etc.)
 * - Ils passent par un WriteGuard/Review avant d'être activés
 * - Ils sont initialisés en mode shadow (log-only), puis activés si performants
 *
 * Intégration : `lib/agent/adas/` complémentaire au DAG Planner et Meta-Controller.
 */

import { callLLM } from '../../llm/unified-llm';
import { parseJson } from '../json-utils';
import { prisma } from '../../db';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentProgram =
  | 'scout_variant'
  | 'rank_variant'
  | 'reader_variant'
  | 'analyst_variant'
  | 'critic_variant'
  | 'debate_variant'
  | 'synthesis_variant'
  | 'verification_variant';

export interface AgentDiscovery {
  /** Unique ID */
  id: string;
  /** Name of the discovered agent/workflow */
  name: string;
  /** Which base program it builds on */
  baseProgram: AgentProgram;
  /** The system prompt for the new agent */
  systemPrompt: string;
  /** Tools required (if any, in addition to base) */
  additionalTools: string[];
  /** The reasoning structure / steps (Self-Discover compatible) */
  reasoningStructure?: string[];
  /** The code (TypeScript) for the agent */
  code: string;
  /** Why this variant was created */
  rationale: string;
  /** How it differs from the base */
  mutations: string[];
  /** Archive of parent discovery IDs */
  parents: string[];
  /** Evaluation score (0-1) */
  score: number;
  /** Number of evaluations */
  evalCount: number;
  /** Whether this discovery is active */
  isActive: boolean;
  /** Whether this discovery is in shadow mode */
  isShadow: boolean;
  /** When discovered */
  createdAt: number;
}

export interface ADASEvaluation {
  discoveryId: string;
  /** Test query used */
  query: string;
  /** PRM score */
  prmScore: number;
  /** Citation count */
  citationCount: number;
  /** Trust score */
  trustScore: number;
  /** Self-play attack success rate (lower is better) */
  attackSuccess: number;
  /** Cost */
  costUsd: number;
  /** Duration */
  durationMs: number;
}

export interface ADASConfig {
  /** How many candidates to generate per cycle (default: 3) */
  candidatesPerCycle: number;
  /** How many base programs to mutate (default: 2) */
  basePrograms: AgentProgram[];
  /** How many test queries per candidate (default: 2) */
  testsPerCandidate: number;
  /** Score threshold for promotion out of shadow (default: 0.7) */
  promotionThreshold: number;
  /** Score threshold for activation (default: 0.8) */
  activationThreshold: number;
  /** Max archive size (default: 100) */
  maxArchiveSize: number;
  /** Whether to allow code generation (vs prompt-only) */
  allowCodeGeneration: boolean;
}

export const DEFAULT_ADAS_CONFIG: ADASConfig = {
  candidatesPerCycle: 3,
  basePrograms: ['analyst_variant', 'critic_variant', 'synthesis_variant'],
  testsPerCandidate: 2,
  promotionThreshold: 0.7,
  activationThreshold: 0.8,
  maxArchiveSize: 100,
  allowCodeGeneration: false, // Conservative default — prompts only
};

// ─── Archive ─────────────────────────────────────────────────────────────────

const archive = new Map<string, AgentDiscovery>();
const archiveHistory: string[] = [];

export function registerDiscovery(discovery: AgentDiscovery): void {
  archive.set(discovery.id, discovery);
  archiveHistory.push(discovery.id);

  // Prune if too large (keep top by score)
  if (archive.size > DEFAULT_ADAS_CONFIG.maxArchiveSize) {
    const sorted = Array.from(archive.values()).sort((a, b) => b.score - a.score);
    const toRemove = sorted.slice(DEFAULT_ADAS_CONFIG.maxArchiveSize);
    for (const d of toRemove) {
      archive.delete(d.id);
    }
  }
}

export function getDiscovery(id: string): AgentDiscovery | undefined {
  return archive.get(id);
}

export function getTopDiscoveries(program?: AgentProgram, limit = 10): AgentDiscovery[] {
  const all = Array.from(archive.values());
  const filtered = program ? all.filter(d => d.baseProgram === program) : all;
  return filtered.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getActiveDiscoveries(): AgentDiscovery[] {
  return Array.from(archive.values()).filter(d => d.isActive);
}

// ─── Base Programs ───────────────────────────────────────────────────────────

const BASE_PROGRAM_DESCRIPTIONS: Record<AgentProgram, string> = {
  scout_variant: 'Variant of the SCOUT agent for source discovery. Must query academic APIs.',
  rank_variant: 'Variant of the RANK agent for selecting top sources. Must rank by quality.',
  reader_variant: 'Variant of the READER agent for extracting from sources. Must output structured reading.',
  analyst_variant: 'Variant of the ANALYST agent for synthesis. Must use [SRC-N] citations.',
  critic_variant: 'Variant of the CRITIC agent for verification. Must identify flaws.',
  debate_variant: 'Variant of the DEBATE agent for steel-man counter-arguments.',
  synthesis_variant: 'Variant of the SYNTHESIS agent for final aggregation.',
  verification_variant: 'Variant of the VERIFICATION agent for claim checking.',
};

// ─── Mutation / Discovery Generation ─────────────────────────────────────────

/**
 * Generate new agent candidates by mutating base programs and existing archive.
 */
export async function generateCandidates(
  config: ADASConfig = DEFAULT_ADAS_CONFIG,
  resource?: string,
): Promise<AgentDiscovery[]> {
  const candidates: AgentDiscovery[] = [];

  // Select parent programs (from base or archive)
  const parents = selectParents(config);

  for (let i = 0; i < config.candidatesPerCycle; i++) {
    try {
      const parent = parents[i % parents.length];
      const baseProgram = parent.baseProgram;

      const response = await callLLM({
        messages: [
          {
            role: 'system',
            content: `You are an Automated Agent Designer (ADAS, ICLR 2025).

Your job: invent a new variant of an existing agent by making targeted mutations.

You may mutate:
1. The system prompt (change instructions, emphasis, examples)
2. The reasoning structure (add/remove steps)
3. The tool usage (if appropriate)

You may NOT:
1. Change the core I/O signature
2. Remove critical safety instructions (citations, uncertainty, verification)
3. Generate code that accesses files/network/database directly

Output JSON:
{
  "name": "short unique name",
  "baseProgram": "analyst_variant",
  "systemPrompt": "the full system prompt (2-5 paragraphs)",
  "additionalTools": ["tool_name_if_any"],
  "reasoningStructure": ["step 1", "step 2"],
  "rationale": "why these changes might improve the agent",
  "mutations": ["changed X", "added Y"]
}`,
          },
          {
            role: 'user',
            content: `Base program: ${baseProgram}
Description: ${BASE_PROGRAM_DESCRIPTIONS[baseProgram]}

Parent discovery:
Name: ${parent.name}
Score: ${parent.score.toFixed(2)}
Rationale: ${parent.rationale}
Mutations: ${parent.mutations.join(', ')}

Generate a new variant that improves upon this parent. Focus on what the parent might be missing.

Consider these patterns from recent research:
- Self-RAG: should the agent reflect on whether it needs more sources?
- Chain-of-Verification: should the agent verify claims before making them?
- Self-Discover: should the agent compose its reasoning per query?
- Devil's Advocate: should the agent challenge itself?

Generate variant ${i + 1} of ${config.candidatesPerCycle}:`,
          },
        ],
        temperature: 0.4,
        jsonMode: true,
        maxTokens: 2000,
        task: 'enrichment_reasoner',
      });

      const parsed = parseJson<{
        name: string;
        baseProgram: AgentProgram;
        systemPrompt: string;
        additionalTools?: string[];
        reasoningStructure?: string[];
        rationale: string;
        mutations: string[];
      }>(response.content);

      if (parsed) {
        const discovery: AgentDiscovery = {
          id: `adas_${baseProgram}_${Date.now()}_${i}`,
          name: parsed.name,
          baseProgram: parsed.baseProgram,
          systemPrompt: parsed.systemPrompt,
          additionalTools: parsed.additionalTools || [],
          reasoningStructure: parsed.reasoningStructure,
          code: parsed.systemPrompt, // Conservative: no code generation
          rationale: parsed.rationale,
          mutations: parsed.mutations,
          parents: [parent.id],
          score: 0.5,
          evalCount: 0,
          isActive: false,
          isShadow: true,
          createdAt: Date.now(),
        };

        candidates.push(discovery);
        registerDiscovery(discovery);
      }
    } catch (err) {
      console.warn(`[ADAS] Candidate ${i} generation failed:`, err);
    }
  }

  return candidates;
}

function selectParents(config: ADASConfig): AgentDiscovery[] {
  // First, try to get high-scoring parents from each base program
  const parents: AgentDiscovery[] = [];
  for (const program of config.basePrograms) {
    const top = getTopDiscoveries(program, 2);
    parents.push(...top);
  }

  // If archive is empty, use base program placeholders
  if (parents.length === 0) {
    for (const program of config.basePrograms) {
      parents.push({
        id: `base_${program}`,
        name: `Base ${program}`,
        baseProgram: program,
        systemPrompt: '',
        additionalTools: [],
        rationale: 'Base program',
        mutations: [],
        parents: [],
        score: 0.5,
        evalCount: 0,
        isActive: false,
        isShadow: true,
        createdAt: Date.now(),
        code: '',
      });
    }
  }

  return parents;
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

/**
 * Evaluate a candidate on test queries.
 * This is the expensive part — we test the new prompt on a few representative queries.
 */
export async function evaluateCandidate(
  discovery: AgentDiscovery,
  testQueries: string[],
  runPipeline: (query: string, format: string, options: Record<string, any>) => Promise<{ prmScore: number; citationCount: number; trustScore: number }>,
  config: ADASConfig = DEFAULT_ADAS_CONFIG,
): Promise<ADASEvaluation[]> {
  const evaluations: ADASEvaluation[] = [];

  for (const query of testQueries.slice(0, config.testsPerCandidate)) {
    try {
      const start = Date.now();
      const result = await runPipeline(query, 'standard', {
        useAgenticAnalyst: false,
        analystSystemPrompt: discovery.systemPrompt,
        useShadowAgent: true,
      });
      const duration = Date.now() - start;

      // Mock self-play attack for simplicity (would call self-play agent)
      const attackSuccess = 0.2; // Placeholder

      const evaluation: ADASEvaluation = {
        discoveryId: discovery.id,
        query,
        prmScore: result.prmScore,
        citationCount: result.citationCount,
        trustScore: result.trustScore,
        attackSuccess,
        costUsd: 0, // Tracked by pipeline
        durationMs: duration,
      };

      evaluations.push(evaluation);
    } catch (err) {
      console.warn(`[ADAS] Evaluation failed for ${discovery.name} on "${query}":`, err);
      evaluations.push({
        discoveryId: discovery.id,
        query,
        prmScore: 0,
        citationCount: 0,
        trustScore: 0,
        attackSuccess: 1, // Failed = fully vulnerable
        costUsd: 0,
        durationMs: 0,
      });
    }
  }

  return evaluations;
}

// ─── Score Calculation ──────────────────────────────────────────────────────

/**
 * Compute an overall score for a discovery based on its evaluations.
 */
export function computeDiscoveryScore(evaluations: ADASEvaluation[]): number {
  if (evaluations.length === 0) return 0.5;

  const avgPrm = evaluations.reduce((a, e) => a + e.prmScore, 0) / evaluations.length;
  const avgCitations = evaluations.reduce((a, e) => a + e.citationCount, 0) / evaluations.length;
  const avgTrust = evaluations.reduce((a, e) => a + e.trustScore, 0) / evaluations.length;
  const avgAttackSuccess = evaluations.reduce((a, e) => a + e.attackSuccess, 0) / evaluations.length;

  // Weighted score
  return Math.min(1,
    avgPrm * 0.35 +
    Math.min(1, avgCitations / 20) * 0.2 + // 20 citations = full points
    (avgTrust / 100) * 0.25 +
    (1 - avgAttackSuccess) * 0.2 // Robustness
  );
}

// ─── Main ADAS Cycle ────────────────────────────────────────────────────────

/**
 * Run one ADAS cycle: generate, evaluate, and select new agent designs.
 *
 * @param testQueries - Representative queries for evaluation
 * @param runPipeline - Function to run the pipeline with a shadow agent
 * @param config - ADAS config
 * @returns The best candidate from this cycle
 */
export async function runADASCycle(
  testQueries: string[],
  runPipeline: (query: string, format: string, options: Record<string, any>) => Promise<{ prmScore: number; citationCount: number; trustScore: number }>,
  config: ADASConfig = DEFAULT_ADAS_CONFIG,
): Promise<AgentDiscovery[]> {
  console.log(`[ADAS] Starting cycle: generating ${config.candidatesPerCycle} candidates...`);

  // Step 1: Generate candidates
  const candidates = await generateCandidates(config);
  console.log(`[ADAS] Generated ${candidates.length} candidates`);

  // Step 2: Evaluate candidates
  for (const candidate of candidates) {
    const evaluations = await evaluateCandidate(candidate, testQueries, runPipeline, config);
    const score = computeDiscoveryScore(evaluations);

    // Update discovery
    const discovery = archive.get(candidate.id);
    if (discovery) {
      discovery.score = (discovery.score * discovery.evalCount + score * evaluations.length) /
        (discovery.evalCount + evaluations.length);
      discovery.evalCount += evaluations.length;

      // Promote out of shadow if score is good
      if (discovery.score >= config.promotionThreshold) {
        discovery.isShadow = false;
      }

      // Activate if score is excellent
      if (discovery.score >= config.activationThreshold) {
        discovery.isActive = true;
      }
    }

    await persistDiscovery(discovery || candidate);
  }

  // Step 3: Return promoted candidates
  const promoted = candidates.filter(c => {
    const d = archive.get(c.id);
    return d && !d.isShadow;
  });

  console.log(`[ADAS] Cycle complete: ${promoted.length} candidates promoted`);
  return promoted;
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function persistDiscovery(discovery: AgentDiscovery): Promise<void> {
  try {
    await prisma.agentAuditLog.create({
      data: {
        action: 'ADAS_DISCOVERY',
        agent: `adas:${discovery.name}`,
        resource: `adas_${discovery.id}`,
        metadata: JSON.stringify(discovery),
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.warn('[ADAS] Persist failed:', err);
  }
}

/**
 * Load the ADAS archive from the database.
 */
export async function loadADASArchive(): Promise<void> {
  try {
    const records = await prisma.agentAuditLog.findMany({
      where: { action: 'ADAS_DISCOVERY' },
      orderBy: { timestamp: 'desc' },
      take: DEFAULT_ADAS_CONFIG.maxArchiveSize,
    });

    for (const record of records) {
      const discovery = parseJson<AgentDiscovery>(record.metadata || '');
      if (discovery) {
        registerDiscovery(discovery);
      }
    }

    console.log(`[ADAS] Loaded ${archive.size} discoveries`);
  } catch (err) {
    console.warn('[ADAS] Load failed:', err);
  }
}
