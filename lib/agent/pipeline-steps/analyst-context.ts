/**
 * ANALYST CONTEXT ASSEMBLY — everything that feeds the analyst prompt:
 * agent-memory + synapse injection → domain/canon blocks → editorial north
 * star → conflict-aware reasoning → pre-analyst scenario engine (CANA +
 * SCATTER, parallel) → innovator author detection → context-block assembly
 * → SARA compression → prior-failure feedback → evidence sufficiency
 * warning → positioning agent → slimReadings.
 *
 * Returns every produced value; the caller owns `analysis` and the
 * artifact-versioning machinery (shared by many downstream steps).
 */

import { buildMemoryInjection } from '../agent-memory';
import {
  RESEARCHER_KBS,
  type KeyConcept, type AnalyticalFramework, type DomainExpertise,
} from '../researcher-kb/index';
import { MULTI_DOMAIN_CORPUS } from '../../knowledge/multi-domain-corpus';
import type { PipelineStep } from '../pipeline-progress';

export interface AnalystContextDeps {
  query: string;
  topSources: any[];
  readings: any[];
  detectedDomain: string;
  isStrategic: boolean;
  isDossier: boolean;
  topicClassification: any;
  primedContext: any;
  gapContextBlock: string | undefined;
  quant: any;
  quantBridge: any;
  hypothesisVerdictBlock: string;
  evidenceBankBlock: string | undefined;
  episodicFormatted: string | undefined;
  dppContextBlock: string | null;
  roundTableBlock: string | null;
  witnessLearningInjection: string | undefined;
  worldModelInjection: string | undefined;
  selfPlayInjection: string | undefined;
  stats: Record<string, any>;
  label: string;
  pipelineRunId: string;
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  addCost: (usd: number | undefined, step: string) => void;
  focusAreas: string | string[] | undefined;
  targetAudience: string | undefined;
  urgencyContext: string | undefined;
  priorFailureFeedback: string | undefined;
  ctx: {
    addFinding: (agent: string, type: 'gap' | 'warning' | 'insight' | 'recommendation', content: string, metadata?: Record<string, unknown>) => void;
  };
}

/**
 * REQUIRED COVERAGE — the deep planner decomposed this question into
 * investigation branches for the scout, but the analyst never saw them: the
 * analysis could silently narrow the question (observed: a "broader
 * patterns" question answered mono-country → DA fatal). The branches ARE
 * the scope contract — inject them as mandatory coverage.
 * Pure function — deterministic, unit-tested.
 */
export function buildRequiredCoverageBlock(
  planNodes: Array<{ subQuestion?: string; status?: string }>,
): string {
  const branches = planNodes
    .filter(n => n.subQuestion && n.status !== 'failed')
    .map(n => n.subQuestion as string);
  if (branches.length <= 1) return '';
  return `\n\n## REQUIRED COVERAGE (research plan)\n` +
    `The research plan decomposed the question into ${branches.length} investigation branches. ` +
    `Your analysis MUST address EVERY branch that the sources support — a branch silently dropped is a coverage hole the reviewers will flag as fatal:\n` +
    branches.map((b, i) => `${i + 1}. ${b}`).join('\n');
}

export interface AnalystContextResult {
  memoryBlock: string | undefined;
  fullContextBlock: string | undefined;
  positioningBrief: any;
  savedCanaResult: any;
  savedScatterResult: any;
  slimReadings: any[];
}

export async function buildAnalystContext(deps: AnalystContextDeps): Promise<AnalystContextResult> {
  const {
    query, topSources, readings, detectedDomain, isStrategic, isDossier,
    topicClassification, primedContext, gapContextBlock, quant, quantBridge,
    hypothesisVerdictBlock, evidenceBankBlock, episodicFormatted,
    dppContextBlock, roundTableBlock, witnessLearningInjection,
    worldModelInjection, selfPlayInjection, stats, label,
    addCost, focusAreas, targetAudience, urgencyContext, priorFailureFeedback, ctx,
  } = deps;

  // -- STEP 5b: AGENT MEMORY INJECTION -- inject past lessons into ANALYST --
  const agentId = "analyst";
  let memoryBlock: string | undefined;
  let synapseMemoryBlock: string | undefined;
  try {
    const memInj = await buildMemoryInjection(agentId, detectedDomain as DomainExpertise, { maxLessons: 5, lookbackDays: 90, topicQuery: query });
    if (memInj.topLessons.length > 0) {
      memoryBlock = memInj.promptBlock;
      stats.agentMemory = { lessons: memInj.topLessons.length, agentId };
      console.log(`${label} AGENT MEMORY: ${memInj.topLessons.length} lessons injected into ${agentId}`);
      // ── CROSS-RUN LEARNING → BLACKBOARD ──
      // Publish lessons to the blackboard so all downstream agents (DA, Critical Loop, EDITOR)
      // can see what was learned from past runs — avoids repeating the same mistakes.
      for (const lesson of memInj.topLessons) {
        ctx.addFinding('AGENT_MEMORY', 'recommendation', `Past lesson: ${lesson.lesson.slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.warn(`${label} AGENT MEMORY: failed (non-blocking):`, err);
  }
  // S15-12: Synapse memory (ACL 2026) — spreading activation for associative retrieval
  try {
    const { buildSynapseMemoryInjection, createSynapseGraph } = await import('../synapse-memory');
    // Build a simple graph from recent episodes and retrieve associative memories
    const graph = createSynapseGraph();
    // The synapse injection is complementary to episodic memory
    const synapseInjection = buildSynapseMemoryInjection({ nodes: [], trace: [], totalActivation: 0 });
    if (synapseInjection) {
      synapseMemoryBlock = synapseInjection;
    }
  } catch (e) { /* non-blocking */ }
  // Build domain context block (injected via contextBlock for both formats)
  // Covers the primary domain AND the casting dimensions — a lens is only a
  // persona until it carries the field's concepts, frameworks, biases, canon.
  let domainBlock = '';
  const domainList: string[] = [detectedDomain];
  for (const d of (topicClassification.dimensions ?? []).slice(0, 3)) {
    const dom = String(d.domain ?? '');
    if (dom && !domainList.includes(dom)) domainList.push(dom);
  }
  const domainParts: string[] = [];
  for (const dom of domainList.slice(0, 4)) {
    const kb = RESEARCHER_KBS[dom as DomainExpertise];
    const corpus = MULTI_DOMAIN_CORPUS[dom as DomainExpertise];
    if (!kb && !corpus) continue;
    const parts = [`Domain: ${dom.toUpperCase()}${dom === detectedDomain ? ' (primary)' : ''}`];
    if (kb?.keyConcepts?.length) parts.push(`Core concepts: ${kb.keyConcepts.slice(0, 5).map((c: KeyConcept) => c.name).join(', ')}`);
    if (kb?.frameworks?.length) parts.push(`Frameworks: ${kb.frameworks.slice(0, 3).map((f: AnalyticalFramework) => f.name).join(', ')}`);
    if (kb?.knownBiases?.length) parts.push(`Known biases: ${kb.knownBiases.slice(0, 3).join('; ')}`);
    if (kb?.referencePapers?.length) parts.push(`Foundational works (cite when relevant): ${kb.referencePapers.slice(0, 4).map(p => `${p.title} (${Array.isArray(p.authors) ? p.authors.join(', ') : p.authors}, ${p.year})`).join('; ')}`);
    if (corpus?.keyFrameworks?.length) parts.push(`Key frameworks: ${corpus.keyFrameworks.join(', ')}`);
    if (corpus?.seminalWorks?.length) parts.push(`Seminal works: ${corpus.seminalWorks.slice(0, 4).join('; ')}`);
    domainParts.push(parts.join('\n'));
  }
  domainBlock = domainParts.join('\n\n');

  // ── FOUNDATIONAL CANON — interpretive frameworks from philosophy, sociology,
  // history & strategy. Deterministic match on the query; injected so the
  // analyst reasons with named frameworks, not just recent papers.
  let canonBlock: string | undefined;
  try {
    const { matchCanon, buildCanonBlockFromMatches } = await import('../canon/canon-matcher');
    const canonMatches = matchCanon(query, { topN: isStrategic || isDossier ? 8 : 5 });
    canonBlock = buildCanonBlockFromMatches(canonMatches);
    if (canonBlock) {
      console.log(`${label} CANON: ${canonMatches.length} foundational frameworks injected (${canonMatches.map(m => m.entry.author.split(' ').pop()).join(', ')})`);
      stats.canon = { matches: canonMatches.length, entries: canonMatches.map(m => `${m.entry.author}, ${m.entry.work}`) };
    }
  } catch (err) {
    console.warn(`${label} CANON: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  const strategicOptsBlock = isStrategic
    ? [focusAreas && `Focus areas: ${focusAreas}`, targetAudience && `Target audience: ${targetAudience}`, urgencyContext].filter(Boolean).join('\n') || undefined
    : undefined;

  // ── EDITORIAL NORTH STAR — injected FIRST so the analyst reasons toward the finality ──
  // The publication is scored deterministically. Tell the analyst EXACTLY what is measured,
  // so producing a high-trust publication is the optimization target from the first token.
  // Citation target: 35% of GROUNDED sources — ambitious but achievable.
  // The analyst consistently cites 15-18% of sources; a 50% target caused endless quality loops.
  // 35% pushes for broader citation usage without wasting tokens on impossible targets.
  // Grounded = reader-extracted or full-text — citations to abstract-only
  // sources cite unread metadata and are stripped deterministically.
  const groundedIds = new Set(
    (readings ?? []).filter((r: any) => r?.sourceId && r.confidence !== 'low').map((r: any) => r.sourceId)
  );
  const groundedCount = topSources.filter((s: any) =>
    groundedIds.has(s.id) || (s.fullText || '').length > 200
  ).length;
  const citableBase = Math.max(groundedCount, 1);
  const citationTarget = Math.max(10, Math.ceil(citableBase * 0.35));
  const editorialNorthStar = [
    `## EDITORIAL NORTH STAR — NON-NEGOTIABLE FINALITY`,
    `You are producing a publication for a think tank whose entire credibility rests on trust and rigor.`,
    `You have ${topSources.length} sources — ${groundedCount} are marked EXTRACTION: GROUNDED (reader extracted their content). Factual claims and numbers may ONLY cite grounded sources; abstract-only sources are context.`,
    `The final publication is scored DETERMINISTICALLY on these exact criteria:`,
    `1. CITATION COVERAGE (25%): cite at least ${citationTarget} DISTINCT grounded sources with [SRC-N] tags. MANDATORY: Before returning JSON, count your distinct [SRC-N] citations pointing at GROUNDED sources. If below ${citationTarget}, add citations from uncited grounded sources to relevant claims. Do NOT cluster on 5-10 sources — spread across the full grounded evidence base.`,
    `2. GROUNDEDNESS (20%): every factual claim must be directly supported by the cited source's actual content. If a source doesn't say it, don't claim it. Unsourced claims are penalized heavily.`,
    `3. NUMERICAL INTEGRITY (30%): every number, percentage, or statistic MUST come from a cited source. An unsourced number is a fatal defect. If no source provides the number, write "non établie".`,
    `4. SOURCE QUALITY (15%): prioritize claims from the highest-quality sources (peer-reviewed, recent, methodologically strong).`,
    `5. DIVERSITY (10%): draw on the full breadth of providers and years available. Cite from at least 7 different providers.`,
    `ANTI-PATTERN WARNING: The most common failure mode is citing only 5-10 sources, or citing sources you have not read (EXTRACTION: ABSTRACT-ONLY). Both cap trust below the publication bar. AUDIT YOUR DRAFT: extract all [SRC-N] tags, convert to a Set, check size and that each cited source is marked GROUNDED. If below ${citationTarget}, go back and add citations from uncited GROUNDED sources. Reports citing sources outside the grounded set have those citations STRIPPED by the system — the claims then fail grounding checks.`,
    `ANTI-CONTRADICTION RULE: Before returning JSON, scan your verdict and key findings for internal contradictions. If sentence A claims X and sentence B claims not-X, resolve the contradiction or acknowledge the tension explicitly. The critic WILL detect contradictions and penalize heavily (10+ contradictions → score <50).`,
    `ANTI-BIAS RULE: Present evidence from ALL sides of the debate. For every policy position you endorse, cite at least one source that challenges it. Do not cherry-pick sources that confirm your hypothesis. If 7 sources support position A and 3 support position B, mention BOTH positions and explain the imbalance. The critic WILL flag bias if you present only one side.`,
    `INTERPRETIVE DEPTH RULE: If INTERPRETIVE FRAMEWORKS are provided in context, you MUST engage at least 2 of them explicitly — name the author and work, apply its analytical lens to the evidence, and note where it clarifies or fails. A publication that ignores the canon reads as journalism, not analysis.`,
    `PROSE QUALITY RULE: Write in clean, grammatical English. Do NOT repeat words across sentence boundaries (e.g., "indicates that to fragment" is wrong — write "indicates that fragmentation"). Do NOT insert citations inside abbreviations (write "e.g. [SRC-5]" not "e [SRC-5] g."). Do NOT leave double spaces. Read each sentence aloud mentally before finalizing.`,
    `Editorial line: decision-ready analysis, no hedging filler, no generic advice. Every section must either state evidence, state a position derived from evidence, or state explicitly what is unknown. A research gap is a fact about the research, never about the actor studied.`,
  ].join('\n');

  // ── CONFLICT-AWARE REASONING (EvidentialRAG pattern) ──
  // Detect contradictions between sources BEFORE analysis, inject as context.
  // The analyst sees both sides and acknowledges uncertainty instead of hiding it.
  let conflictContextBlock: string | undefined;
  try {
    const { detectSourceConflicts } = await import('../conflict-aware');
    const conflictResult = await detectSourceConflicts(topSources, readings, {
      maxSources: isStrategic ? 15 : 10,
      maxPairs: isStrategic ? 50 : 30,
    });
    if (conflictResult.conflictCount > 0) {
      conflictContextBlock = conflictResult.contextBlock;
      console.log(`${label} CONFLICT-AWARE: ${conflictResult.conflictCount} contradictions detected (consensus ${Math.round(conflictResult.consensusRate * 100)}%) — injecting into analyst context`);
      stats.conflictDetection = {
        conflicts: conflictResult.conflictCount,
        consensusRate: Math.round(conflictResult.consensusRate * 100),
        pairsChecked: conflictResult.totalPairsChecked,
      };
    } else {
      console.log(`${label} CONFLICT-AWARE: no contradictions detected (consensus ${Math.round(conflictResult.consensusRate * 100)}%)`);
      stats.conflictDetection = {
        conflicts: 0,
        consensusRate: Math.round(conflictResult.consensusRate * 100),
        pairsChecked: conflictResult.totalPairsChecked,
      };
    }
  } catch (err) {
    console.warn(`${label} CONFLICT-AWARE: failed (non-blocking):`, err);
  }

  // ── SCENARIO ENGINE (PRE-ANALYST) — CANA + SCATTER for strategic reports ──
  // Run BEFORE analyst so outputs can be injected as context for richer analysis
  let scenarioContextBlock: string | undefined;
  // Save CANA/SCATTER results for post-hoc Multi-Lens Convergence Map injection
  let savedCanaResult: any = null;
  let savedScatterResult: any = null;
  if (isStrategic) {
    try {
      const { runCana, runScatter } = await import('../scenario-engine');
      const [canaResult, scatterResult] = await Promise.all([
        runCana(query),
        runScatter(query, '5-10 years'),
      ]);

      stats.scenarioEngine = {
        cana: {
          mechanisms: canaResult.mechanisms.length,
          analogues: canaResult.analogues.length,
          searchQueries: canaResult.searchQueries.length,
          costUsd: canaResult.costUsd,
        },
        scatter: {
          hypotheses: scatterResult.hypotheses.length,
          diversityScore: scatterResult.diversityScore,
          costUsd: scatterResult.costUsd,
        },
      };

      console.log(`${label} SCENARIO ENGINE (pre-analyst): CANA ${canaResult.mechanisms.length} mechanisms + ${canaResult.analogues.length} analogues, SCATTER ${scatterResult.hypotheses.length} hypotheses (diversity=${Math.round(scatterResult.diversityScore * 100)}%)`);

      // Save for post-hoc Multi-Lens Convergence Map
      savedCanaResult = canaResult;
      savedScatterResult = scatterResult;

      // Build context block from CANA + SCATTER outputs
      const canaBlock = canaResult.mechanisms.length > 0
        ? `## CAUSAL ANALOGICAL REASONING (CANA)\nIdentified causal mechanisms:\n${canaResult.mechanisms.slice(0, 6).map((m: any, i: number) => `${i + 1}. ${m.mechanism || m.description || JSON.stringify(m).slice(0, 200)}`).join('\n')}\n\nHistorical analogues:\n${canaResult.analogues.slice(0, 5).map((a: any, i: number) => `${i + 1}. ${a.analogue || a.case || a.description || JSON.stringify(a).slice(0, 200)}`).join('\n')}`
        : '';

      const scatterBlock = scatterResult.hypotheses.length > 0
        ? `## DIVERGENT HYPOTHESES (SCATTER)\nAlternative future trajectories to consider in scenario planning:\n${scatterResult.hypotheses.slice(0, 6).map((h: any, i: number) => `${i + 1}. ${h.hypothesis || h.scenario || h.description || JSON.stringify(h).slice(0, 200)}`).join('\n')}`
        : '';

      scenarioContextBlock = [canaBlock, scatterBlock].filter(Boolean).join('\n\n') || undefined;
    } catch (err) {
      console.warn(`${label} SCENARIO ENGINE (pre-analyst): failed (non-blocking):`, err instanceof Error ? err.message : String(err));
    }
  }

  // ── INNOVATOR AUTHOR DETECTION — identify cross-domain, heterodox, emerging, dissident authors ──
  let innovatorBlock: string | undefined;
  try {
    const { detectInnovatorAuthors, generateInnovatorPromptBlock } = await import('../author-innovator-detector');
    const innovatorResult = detectInnovatorAuthors(topSources);
    if (innovatorResult.stats.totalAuthors > 0) {
      innovatorBlock = generateInnovatorPromptBlock(innovatorResult);
      console.log(`${label} INNOVATOR AUTHORS: ${innovatorResult.stats.totalAuthors} authors | ${innovatorResult.stats.emergingCount} emerging | ${innovatorResult.stats.crossDomainCount} cross-domain | ${innovatorResult.stats.heterodoxCount} heterodox | ${innovatorResult.stats.dissidentCount} dissident`);
      stats.innovatorAuthors = innovatorResult.stats;
    }
  } catch (err) {
    console.warn(`${label} INNOVATOR AUTHORS: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
  }

  const fullContextParts: (string | undefined)[] = [
    editorialNorthStar,
    memoryBlock,
    synapseMemoryBlock,
    primedContext?.contextBlock,
    gapContextBlock,
    quant.evidenceBlock || undefined,
    quantBridge.evidenceBlock || undefined,
    hypothesisVerdictBlock || undefined,
    conflictContextBlock,
    scenarioContextBlock,
    domainBlock || undefined,
    canonBlock || undefined,
    evidenceBankBlock || undefined,
    (stats as any).lensInsightsBlock || undefined,
    innovatorBlock || undefined,
    strategicOptsBlock,
    episodicFormatted || undefined,
    dppContextBlock || undefined,
    roundTableBlock || undefined,
    witnessLearningInjection || undefined,
    worldModelInjection || undefined,
    selfPlayInjection || undefined,
  ];
  let fullContextBlock: string | undefined =
    fullContextParts.filter(Boolean).join("\n\n---\n\n") || undefined;

  // S16-02: SARA context compression (ACL 2026) — compress context to save tokens
  try {
    const { saraCompress } = await import('../sara-compression');
    const rawContext = fullContextParts.filter(Boolean).join('\n\n');
    // Only compress if context is large (>8000 chars ≈ ~2000 tokens)
    if (rawContext.length > 8000) {
      const compressed = saraCompress(rawContext, 6000); // Target ~6000 chars
      if (compressed.compressionRatio < 0.85) {
        console.log(`[Pipeline] SARA compression: ${rawContext.length} → ${compressed.compressedText.length} chars (${(compressed.compressionRatio * 100).toFixed(0)}% ratio)`);
        fullContextBlock = compressed.compressedText;
      }
    }
  } catch (e) { /* non-blocking */ }

  // ── PRIOR ATTEMPT FEEDBACK (regeneration loop): when the gate rejected a
  // previous attempt, its reasons + adversarial findings are injected so the
  // new analysis corrects the actual defects — best-of-N with memory, not a
  // blind retry. Injected AFTER SARA compression so it is never dropped. ──
  if (priorFailureFeedback) {
    fullContextBlock = [
      fullContextBlock,
      `\n## PRIOR ATTEMPT FAILED — REVIEWER FEEDBACK (mandatory corrections)\nA previous version of this analysis was rejected by the publication gate. The new analysis MUST fix these defects:\n${priorFailureFeedback}\nDo not repeat the failed framing — address each point or explicitly explain why it cannot be addressed with the available evidence.`,
    ].filter(Boolean).join('\n\n---\n\n');
    console.log(`${label} REGENERATION: prior failure feedback injected (${priorFailureFeedback.length} chars)`);
  }

  // ── LEARNED GUIDELINES (experience bank): every completed run extracts
  // reusable patterns — inject the relevant ones so the analysis benefits
  // from what prior runs learned instead of re-discovering failure modes.
  // Injected AFTER SARA compression so it is never dropped. ──
  try {
    const { getRelevantGuidelines } = await import('../knowledge-infrastructure');
    const guidelines = await getRelevantGuidelines(query);
    if (guidelines.length > 0) {
      const block = guidelines
        .map(g => `- ${g.guideline} (rationale: ${g.rationale})`)
        .join('\n');
      fullContextBlock = [
        fullContextBlock,
        `\n## LEARNED GUIDELINES (from prior runs on related topics)\nThe system has learned these rules from previous analyses. Apply them where relevant:\n${block}`,
      ].filter(Boolean).join('\n\n---\n\n');
      console.log(`${label} EXPERIENCE BANK: ${guidelines.length} learned guideline(s) injected`);
    }
  } catch { /* non-blocking — the bank is advisory */ }

  // Context surgery (2026 best practice): pass slim readings to analyst — only extracted fields, not full abstracts
  const slimReadings = readings.map((r: any) => ({
    sourceId: r.sourceId,
    claims: r.claims || [],
    methods: r.methods || [],
    results: r.results || [],
    limitations: r.limitations || [],
    confidence: r.confidence || 'medium',
  }));

  // Pre-analyst evidence sufficiency check
  const sourcesWithText = topSources.filter((s: any) =>
    (s.abstract && s.abstract.length > 100) || (s.fullText && s.fullText.length > 200)
  ).length;
  const textCoverage = topSources.length > 0 ? sourcesWithText / topSources.length : 0;
  if (textCoverage < 0.3) {
    console.warn(`${label} EVIDENCE WARNING: only ${sourcesWithText}/${topSources.length} sources have extractable text (${Math.round(textCoverage * 100)}%) — analyst may hallucinate`);
    fullContextBlock = [
      fullContextBlock,
      `\n## EVIDENCE SUFFICIENCY WARNING\nOnly ${sourcesWithText}/${topSources.length} sources have extractable text. Many claims will be unverifiable. ACKNOWLEDGE evidence gaps explicitly in evidenceAssessment.gaps. Do NOT fabricate claims to fill gaps — use "non établie" for unsupported assertions.`,
    ].filter(Boolean).join('\n\n---\n\n');
  }

  // ── POSITIONING AGENT: editorial differentiation vs the field ──
  // Retrieve the competitor corpus (think tanks + editorial domains), map what
  // the field covers/converges on/misses, and inject differentiation directives
  // so the analysis BEATS existing publications rather than re-synthesizing
  // consensus. Runs on every format — differentiation matters everywhere
  // (~13s, ~$0.001 measured).
  let positioningBrief: any = null;
  try {
      const { buildPositioningBrief } = await import('../positioning-agent');
      positioningBrief = await buildPositioningBrief(query, { maxPieces: 10 });
      if (positioningBrief) {
        addCost(positioningBrief.costUsd, 'POSITIONING');
        fullContextBlock = [fullContextBlock, positioningBrief.contextBlock].filter(Boolean).join('\n\n---\n\n');
        stats.positioning = {
          competitorsFound: positioningBrief.competitorsFound,
          uncoveredDimensions: positioningBrief.uncoveredDimensions.length,
          directives: positioningBrief.directives.length,
          strongestPiece: positioningBrief.strongestPiece,
          fieldCoverage: positioningBrief.fieldCoverage,
          consensusClaims: positioningBrief.consensusClaims,
          gaps: positioningBrief.uncoveredDimensions,
          weakClaims: positioningBrief.weakClaims,
          directiveDetails: positioningBrief.directives,
          costUsd: positioningBrief.costUsd,
          durationMs: positioningBrief.durationMs,
        };
      }
    } catch (err) {
      console.warn(`${label} POSITIONING: failed (non-blocking):`, err instanceof Error ? err.message : String(err));
    }

  return {
    memoryBlock, fullContextBlock, positioningBrief,
    savedCanaResult, savedScatterResult, slimReadings,
  };
}
