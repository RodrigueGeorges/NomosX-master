/**
 * CLASSIFICATION + ROUTING GATES — STEP 4b: topic classification →
 * foundational-source injection → complexity gate → gap filler (retrieve +
 * scout) → casting → LAS gate.
 *
 * Mutates `topSources` (foundational push) and the step-routing flags —
 * the caller owns the flags and reads them back from the result. Stats keys:
 * topicClassification, casting.
 */

import { classifyTopic } from '../topic-classifier';
import { getRelevantGaps } from '../gap-filler';
import { RESEARCHER_KBS } from '../researcher-kb/index';
import type { CastingResult } from '../editorial-types';

export interface FoundationalSource {
  id: string; title: string; abstract: string; authors: Array<{ name: string }>;
  year: number; doi: string | null; provider: string; url: string | null;
  type: string; qualityScore: number; metadata: Record<string, unknown>;
}

export interface ClassificationGatesDeps {
  query: string;
  topSources: any[];
  allSourceIds: string[];
  providers: any[];
  scout: (query: string, providers: any, limit?: number) => Promise<any>;
  stats: Record<string, any>;
  label: string;
  isStrategic: boolean;
  enableEnhancedCouncil: boolean | undefined;
  useThinkTankPack: boolean;
  editorialV2: boolean;
  skipRetrieval?: boolean;
  runMetaAnalysisStep: boolean;
  runDeliberationStep: boolean;
  runDebateStep: boolean;
  runDevilsAdvocateStep: boolean;
  ctx: {
    setDomain: (domain: string) => void;
    setComplexity: (complexity: 'low' | 'medium' | 'high') => void;
    skipStep: (step: string) => void;
    addFinding: (agent: string, type: 'gap' | 'warning' | 'insight' | 'recommendation', content: string, metadata?: Record<string, unknown>) => void;
  };
}

export interface ClassificationGatesResult {
  topicClassification: any;
  detectedDomain: string;
  castingResult: CastingResult | undefined;
  foundationalSources: FoundationalSource[];
  allSourceIds: string[];
  gapContextBlock: string | undefined;
  runMetaAnalysisStep: boolean;
  runDeliberationStep: boolean;
  runDebateStep: boolean;
  runDevilsAdvocateStep: boolean;
}

export async function runClassificationGates(deps: ClassificationGatesDeps): Promise<ClassificationGatesResult> {
  const {
    query, topSources, providers, scout, stats, label, isStrategic,
    enableEnhancedCouncil, useThinkTankPack, editorialV2, ctx,
  } = deps;
  let {
    allSourceIds, runMetaAnalysisStep, runDeliberationStep,
    runDebateStep, runDevilsAdvocateStep,
  } = deps;

  // ── STEP 4b: DOMAIN CLASSIFICATION (LLM primary, rules fallback) ───
  const topicClassification = await classifyTopic(query);
  const detectedDomain = topicClassification.primaryDomain;
  ctx.setDomain(detectedDomain);

  // ── PREPARE FOUNDATIONAL SOURCES (post-classification, pre-rank) ──
  // Seminal works from researcher KB — prepared here, injected AFTER rank.
  // They don't exist in DB, so rank() would filter them out.
  let foundationalSources: FoundationalSource[] = [];
  try {
    const kb = RESEARCHER_KBS[detectedDomain as keyof typeof RESEARCHER_KBS];
    if (kb?.referencePapers && kb.referencePapers.length > 0) {
      foundationalSources = kb.referencePapers.slice(0, 3).map((p, i) => ({
        id: `foundational:${detectedDomain}:${i}`,
        title: p.title,
        abstract: `${p.significance}. Authors: ${p.authors}. Journal: ${p.journal}. Year: ${p.year}.`,
        authors: [{ name: String(p.authors) }],
        year: p.year,
        doi: null,
        provider: 'foundational',
        url: null,
        type: 'reference',
        qualityScore: 95,
        metadata: { seminal: true, domain: detectedDomain },
      }));
      console.log(`${label} FOUNDATIONAL INJECTION: prepared ${foundationalSources.length} seminal works from ${detectedDomain} KB (will inject after rank)`);
    }
  } catch (err) {
    console.warn(`${label} FOUNDATIONAL INJECTION: failed (non-blocking):`, err);
  }

  // ── INJECT FOUNDATIONAL SOURCES (post-rank, post-classification) ──
  // Seminal works from researcher KB are added directly to topSources.
  // They bypass rank() because they don't exist in the DB — they're context-only
  // reference papers that the analyst can cite for theoretical grounding.
  if (foundationalSources.length > 0) {
    for (const fs of foundationalSources) {
      (fs as any).loadBearing = false;
      (fs as any).compositeScore = 85;
      topSources.push(fs as any);
    }
    console.log(`${label} FOUNDATIONAL INJECTION: +${foundationalSources.length} seminal works injected into topSources (now ${topSources.length} total)`);
  }
  ctx.addFinding('CLASSIFIER', 'insight', `Domain: ${detectedDomain} (confidence: ${topicClassification.confidence})`, { domains: topicClassification.domains, isCrossDomain: topicClassification.isCrossDomain });
  stats.topicClassification = {
    primaryDomain: topicClassification.primaryDomain,
    domains: topicClassification.domains,
    dimensions: topicClassification.dimensions,
    detectedSubject: topicClassification.detectedSubject,
    isCrossDomain: topicClassification.isCrossDomain,
    confidence: topicClassification.confidence,
    reasoning: topicClassification.reasoning,
  };
  console.log(`${label} DOMAIN: ${detectedDomain} (confidence: ${topicClassification.confidence}, cross=${topicClassification.isCrossDomain})`);
  if (topicClassification.dimensions.length >= 2) {
    console.log(`${label} COLLISION: ${topicClassification.dimensions.map((d) => d.label).join(' × ')}`);
  }

  // ── COMPLEXITY GATE: adapt pipeline steps to query difficulty (LAS pattern, ACL 2026) ──
  // For low-complexity non-strategic topics, skip expensive steps that yield diminishing returns.
  // Strategic reports always run the full stack regardless of complexity.
  if (!isStrategic && !enableEnhancedCouncil) {
    const domainCount = topicClassification?.domains?.length ?? 1;
    const isCrossDomain = topicClassification?.isCrossDomain ?? false;
    const isLowComplexity = domainCount <= 1 && !isCrossDomain && topicClassification.confidence >= 0.8;
    if (isLowComplexity) {
      runMetaAnalysisStep = false;
      runDeliberationStep = false;
      runDebateStep = false;
      ctx.setComplexity('low');
      ctx.skipStep('meta-analysis');
      ctx.skipStep('deliberation');
      ctx.skipStep('debate');
      ctx.addFinding('COMPLEXITY_GATE', 'insight', `Low complexity: skipping meta-analysis, deliberation, debate`);
      console.log(`${label} COMPLEXITY GATE: low-complexity topic (1 domain, confidence ${topicClassification.confidence}) — skipping meta-analysis, deliberation, debate`);
    } else {
      ctx.setComplexity(isCrossDomain ? 'high' : 'medium');
    }
    // Meta-analysis only relevant for domains with effect sizes / quantitative studies
    const META_ANALYSIS_DOMAINS = ['health', 'medical', 'economics', 'finance', 'social_sciences', 'statistics'];
    if (!META_ANALYSIS_DOMAINS.includes(detectedDomain)) {
      runMetaAnalysisStep = false;
      ctx.skipStep('meta-analysis');
      console.log(`${label} COMPLEXITY GATE: meta-analysis skipped (domain "${detectedDomain}" not quantitative-study oriented)`);
    }
  } else {
    ctx.setComplexity('high');
  }

  // STEP 4b2: GAP FILLER — retrieve knowledge gaps from prior analyses
  let gapQueries: string[] = [];
  let gapContextBlock: string | undefined;
  try {
    const gapInjection = await getRelevantGaps(query, detectedDomain, 3);
    if (gapInjection.gapsAddressed > 0) {
      gapQueries = gapInjection.gapQueries;
      gapContextBlock = gapInjection.gapContext;
      console.log(`${label} GAP FILLER: ${gapInjection.gapsAddressed} prior knowledge gaps relevant — adding ${gapQueries.length} search queries`);
    }
  } catch (err) {
    console.warn(`${label} GAP FILLER: retrieval failed (non-blocking):`, err);
  }

  // STEP 4d: GAP FILLER SCOUT — run supplementary searches for prior knowledge gaps
  if (gapQueries.length > 0 && !deps.skipRetrieval) {
    try {
      const gapResult = await scout(gapQueries.join(' OR '), providers.slice(0, 3), 10);
      const gapSourceIds = Array.isArray(gapResult) ? gapResult.map((s: any) => s.id) : (gapResult.sourceIds || []);
      if (gapSourceIds.length > 0) {
        allSourceIds = [...new Set([...allSourceIds, ...gapSourceIds])];
        console.log(`${label} GAP FILLER SCOUT: +${gapSourceIds.length} sources from gap queries`);
      }
    } catch (err) {
      console.warn(`${label} GAP FILLER SCOUT: failed (non-blocking):`, err);
    }
  }

  let castingResult: CastingResult | undefined;
  // CASTING: active when think-tank pack or editorial V2 is enabled — required for position-first rendering
  if (useThinkTankPack || editorialV2) {
    try {
      const { castingAgent } = await import('../casting-agent');
      castingResult = await castingAgent(query, topicClassification);
      stats.casting = {
        teamSize: castingResult.team.length,
        collisionSummary: castingResult.collisionSummary,
        costUsd: castingResult.costUsd,
      };
      console.log(`${label} CASTING: ${castingResult.team.length} lenses — ${castingResult.collisionSummary}`);
    } catch (err) {
      console.warn(`${label} CASTING: failed (non-blocking):`, err);
      stats.casting = { skipped: true, reason: err instanceof Error ? err.message : String(err) };
      // Fallback: ensure castingResult is set so arbiter + foresight can still run
      const { dimensionsFromClassification } = await import('../editorial-types');
      const fallbackDims = dimensionsFromClassification(topicClassification);
      const fallbackTeam = [
        { lensId: 'lead', domain: 'Policy', role: 'lead' as const, mandate: `Primary analytical lens on: ${query.slice(0, 120)}` },
        { lensId: 'friction', domain: 'Evidence integrity', role: 'friction' as const, mandate: 'Challenge causal claims and test whether conclusions survive missing counterevidence.', frictionWith: 'Policy' },
        { lensId: 'stress-test', domain: 'Strategic foresight', role: 'stress-test' as const, mandate: 'Stress-test projections against alternative futures and identify black-swan risks.', frictionWith: 'Evidence integrity' },
      ];
      castingResult = { team: fallbackTeam, collisionSummary: query.slice(0, 100), productiveFriction: 'Evidence integrity challenges Policy; foresight stress-tests against alternative futures.', costUsd: 0 };
      console.log(`${label} CASTING: using pipeline-level fallback (${fallbackTeam.length} lenses)`);
    }
  } else {
    stats.casting = { skipped: true, reason: 'suppressed — enable useThinkTankPack or editorialV2' };
  }

  // ── LAS GATE (LLM-as-Scheduler, ACL 2026 best practice) ──
  // Lightweight deterministic gate after RANK: adapt downstream agents based on evidence pool.
  // No LLM call — uses pool size + domain + complexity to route.
  {
    const poolSize = topSources.length;
    const providerDiversity = new Set(topSources.map((s: any) => s.provider)).size;
    if (!isStrategic) {
      // Briefs with small pools: skip expensive agents that need diverse evidence
      if (poolSize < 8) {
        runDebateStep = false;
        runMetaAnalysisStep = false;
        console.log(`${label} LAS GATE: small pool (${poolSize} sources) — skipping debate, meta-analysis`);
      }
      if (poolSize < 6 && providerDiversity < 3) {
        runDevilsAdvocateStep = false;
        console.log(`${label} LAS GATE: very small pool + low diversity — skipping devil's advocate (insufficient for epistemic challenge)`);
      }
    }
    console.log(`${label} LAS GATE: pool=${poolSize}, providers=${providerDiversity}, debate=${runDebateStep}, meta=${runMetaAnalysisStep}, DA=${runDevilsAdvocateStep}, foresight_eligible=${poolSize >= 10}`);
    ctx.addFinding('LAS_GATE', 'insight', `Pool: ${poolSize} sources from ${providerDiversity} providers — debate=${runDebateStep}, meta=${runMetaAnalysisStep}, DA=${runDevilsAdvocateStep}`);
  }

  return {
    topicClassification, detectedDomain, castingResult, foundationalSources,
    allSourceIds, gapContextBlock,
    runMetaAnalysisStep, runDeliberationStep, runDebateStep, runDevilsAdvocateStep,
  };
}
