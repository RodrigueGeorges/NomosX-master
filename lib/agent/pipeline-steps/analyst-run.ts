/**
 * ANALYST EXECUTION — MoA (opt-in) → durable multipass → test-time scaling
 * (second candidate on strategic + budget headroom, best citation coverage
 * wins) → stats.analyst.
 *
 * `analysis` is returned — a successful opt-in MoA result is adopted, not
 * overwritten by the multipass fallback.
 */

import { runMixtureOfAgents } from '../moa/mixture-of-agents';
import { isFreeRun } from '../../free-run';
import { hasRunHeadroomWithReserve, remainingRunMs } from './time-budget';
import type { PipelineStep } from '../pipeline-progress';

export interface AnalystRunDeps {
  query: string;
  topSources: any[];
  slimReadings: any[];
  fullContextBlock: string | undefined;
  detectedDomain: string;
  isStrategic: boolean;
  useMixtureOfAgents: boolean;
  runningCostUsd: number;
  maxBudgetUsd: number | undefined;
  stats: Record<string, any>;
  label: string;
  pipelineRunId: string;
  pipelineStart: number;
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  addCost: (usd: number | undefined, step: string) => void;
  durable: <T>(name: string, fn: () => Promise<T>, costUsd?: number) => Promise<T>;
  analystMultipass: (query: string, topSources: any[], readings: any[], opts: any) => Promise<any>;
  bumpAnalysisArtifact: () => void;
  ctx: {
    setAnalystOutput: (analysis: any) => void;
    recordAgentTiming: (agent: string, ms: number) => void;
  };
}

export interface AnalystRunResult {
  analysis: any;
  analystCostUsd: number | undefined;
}

export async function runAnalystExecution(deps: AnalystRunDeps): Promise<AnalystRunResult> {
  const {
    query, topSources, slimReadings, fullContextBlock, detectedDomain,
    isStrategic, useMixtureOfAgents, runningCostUsd, maxBudgetUsd,
    stats, label, pipelineRunId, pipelineStart, emitProgress, addCost,
    durable, analystMultipass, bumpAnalysisArtifact, ctx,
  } = deps;
  let analysis: any;

  // ── ANALYST: MoA (opt-in) vs classic multipass ──
  // MoA mode: multiple specialist analysts collaborate
  // Classic mode: the analyst receives all sources and synthesizes in 3 passes
  if (useMixtureOfAgents) {
    console.log(`${label} ANALYST: Mixture of Agents mode — multiple specialists collaborating`);
    emitProgress(pipelineRunId, "ANALYST", "started", `Mixture of Agents analysis (${isStrategic ? "strategic" : "brief"})...`);
    try {
      // S16-01: Graph-of-Agents (ICLR 2026) — select top-3 agents by capability match
      // instead of using all N agents. Reduces cost while improving quality.
      let selectedAgentIds: string[] | undefined;
      try {
        const { selectAgents, DEFAULT_GOA_CONFIG } = await import('../graph-of-agents');
        const availableAgents = [
          { id: 'evidence', role: 'evidence specialist', capabilities: ['data analysis', 'source evaluation', 'fact checking'], model: 'deepseek' },
          { id: 'synthesis', role: 'synthesis specialist', capabilities: ['synthesis', 'integration', 'narrative'], model: 'deepseek' },
          { id: 'skeptic', role: 'skeptic', capabilities: ['criticism', 'risk analysis', 'counter-arguments'], model: 'glm' },
          { id: 'uncertainty', role: 'uncertainty specialist', capabilities: ['uncertainty quantification', 'confidence estimation'], model: 'kimi' },
          { id: 'methodologist', role: 'methodologist', capabilities: ['methodology', 'research design', 'statistics'], model: 'deepseek' },
          { id: 'domain_expert', role: 'domain expert', capabilities: ['domain knowledge', 'expertise', 'context'], model: 'glm' },
        ];
        const selected = selectAgents(query, availableAgents, DEFAULT_GOA_CONFIG);
        selectedAgentIds = selected.map(a => a.id);
        console.log(`${label} GoA: selected ${selectedAgentIds.length} agents: ${selectedAgentIds.join(', ')}`);
      } catch (e) { /* non-blocking — use all agents */ }

      const moaResult = await runMixtureOfAgents(
        query,
        topSources.map((s: any) => ({ id: s.id, title: s.title, abstract: s.abstract, fullText: s.fullText })),
        fullContextBlock || '',
        { isStrategic, ...(selectedAgentIds ? { agents: selectedAgentIds as any } : {}) },
      );
      console.log(`${label} ANALYST: MoA complete — ${moaResult.specialistAnalyses.length} specialists, ${moaResult.consensus.length} consensus points, ${moaResult.controversies.length} controversies, confidence=${moaResult.overallConfidence.toFixed(2)}`);
      emitProgress(pipelineRunId, "ANALYST", "completed", `MoA: ${moaResult.specialistAnalyses.length} specialists, confidence ${moaResult.overallConfidence.toFixed(2)}`);

      // Use the aggregated analysis as the final analysis
      analysis = {
        title: query,
        summary: moaResult.aggregatedAnalysis.slice(0, 500),
        consensus: moaResult.consensus.join('\n\n'),
        disagreements: moaResult.controversies.map(c => `${c.topic}: ${c.resolution}`).join('\n\n'),
        debate: {
          pro: moaResult.controversies.map(c => c.positions.find(p => p.agent)?.position).filter(Boolean).join('\n'),
          con: moaResult.controversies.map(c => c.positions.slice(1).map(p => p.position).join('\n')).filter(Boolean).join('\n'),
          synthesis: moaResult.controversies.map(c => c.resolution).join('\n\n'),
        },
        evidence: moaResult.specialistAnalyses.find(a => a.agentId === 'evidence')?.analysis || '',
        implications: moaResult.specialistAnalyses.find(a => a.agentId === 'synthesis')?.analysis || '',
        risks: moaResult.specialistAnalyses.find(a => a.agentId === 'skeptic')?.analysis || '',
        open_questions: moaResult.controversies.map(c => c.topic).join('\n'),
        what_changes_mind: moaResult.specialistAnalyses.find(a => a.agentId === 'uncertainty')?.keyInsights.join('\n') || '',
        _meta: {
          moaResult,
          mode: 'mixture_of_agents',
          agentCount: moaResult.specialistAnalyses.length,
          overallConfidence: moaResult.overallConfidence,
          totalCostUsd: moaResult.totalCostUsd,
        },
      };
      bumpAnalysisArtifact();
      addCost(moaResult.totalCostUsd, 'ANALYST MOA');
      (stats as any).moa = {
        agentCount: moaResult.specialistAnalyses.length,
        consensus: moaResult.consensus.length,
        controversies: moaResult.controversies.length,
        uniqueInsights: moaResult.uniqueInsights.length,
        overallConfidence: moaResult.overallConfidence,
      };
    } catch (err: any) {
      console.warn(`${label} ANALYST: MoA failed, falling back to classic: ${err.message}`);
      emitProgress(pipelineRunId, "ANALYST", "started", `MoA failed — falling back to classic multipass...`);
      // Fall through to classic multipass below
    }
  }

  // ── DOMAIN EXPERT LENS ──
  // The 22-expert registry (methodologies, calibration rules, known biases,
  // frameworks + KB/memory injection) existed but was NEVER wired into the
  // live pipeline — runHarvardCouncilStep is dead config and stats.harvardCouncil
  // is hardcoded skipped. One bounded lead-expert pass reviews the corpus
  // BEFORE the analyst: its causal mechanisms, confounders and blind spots
  // become expert priors the 3 passes must engage (adopt or explicitly rebut).
  let effectiveContext = fullContextBlock || '';
  // Producer work — must not start inside the repair tail reserve.
  const EXPERT_LENS_MS = Number(process.env.EXPERT_LENS_HEADROOM_MS ?? 300_000);
  const expertFitsReserve = hasRunHeadroomWithReserve(pipelineStart, isStrategic, EXPERT_LENS_MS);
  if ((!maxBudgetUsd || runningCostUsd < maxBudgetUsd * 0.6) && expertFitsReserve) {
    try {
      const { detectRelevantExperts, runExpertAnalysis } = await import('../phd-researcher');
      // Strategic reports get two expert lenses (Co-STORM perspective coverage);
      // briefs get the single lead domain — bounded cost per format.
      const expertDomains = detectRelevantExperts(query, { maxExperts: isStrategic ? 2 : 1, strategic: isStrategic });
      if (expertDomains.length > 0) {
        const expertSources = isFreeRun() ? topSources.slice(0, 10) : topSources;
        const sourceContext = expertSources
          .map((s: any, i: number) => `[SRC-${i + 1}] ${s.title || 'untitled'} — ${String(s.abstract || s.fullText || '').slice(0, 280)}`)
          .join('\n');
        const expertResults = await Promise.allSettled(
          expertDomains.map(d => runExpertAnalysis(d, query, sourceContext, topSources.length, pipelineRunId))
        );
        for (const [idx, r] of expertResults.entries()) {
          if (r.status !== 'fulfilled') continue;
          const expert = r.value;
          const leadDomain = expertDomains[idx];
          addCost(expert.costUsd, 'DOMAIN_EXPERT');
          (stats as any).domainExpert = {
            domains: expertDomains,
            confidence: expert.confidence,
            keyFindings: expert.keyFindings?.length ?? 0,
            blindSpots: expert.blind_spots?.length ?? 0,
            costUsd: ((stats as any).domainExpert?.costUsd ?? 0) + (expert.costUsd ?? 0),
            durationMs: expert.durationMs,
          };
          effectiveContext += `\n\n## DOMAIN EXPERT PRE-ANALYSIS (${leadDomain})\n` +
            `A domain specialist reviewed this corpus before you. Treat the following as expert priors — adopt what survives your scrutiny, explicitly rebut what the evidence contradicts:\n` +
            `- Key findings: ${(expert.keyFindings ?? []).slice(0, 6).join('; ') || 'none'}\n` +
            `- Causal mechanisms identified: ${(expert.causal_mechanisms ?? []).slice(0, 6).join('; ') || 'none'}\n` +
            `- Confounders to control: ${(expert.confounders ?? []).slice(0, 5).join('; ') || 'none'}\n` +
            `- Blind spots flagged: ${(expert.blind_spots ?? []).slice(0, 5).join('; ') || 'none'}\n` +
            `- Evidence quality: level ${expert.evidence_quality?.overallLevel ?? '?'}/5, bias risk ${expert.evidence_quality?.biasRisk ?? '?'}${expert.evidence_quality?.weaknesses?.length ? ` — weaknesses: ${expert.evidence_quality.weaknesses.slice(0, 3).join('; ')}` : ''}\n` +
            (expert.dissent ? `- Expert dissent: ${expert.dissent}\n` : '');
          console.log(`${label} DOMAIN EXPERT: ${leadDomain} lens injected (confidence ${expert.confidence}, ${expert.keyFindings?.length ?? 0} findings, $${expert.costUsd?.toFixed(4) ?? '?'})`);
        }
        if (effectiveContext.length > (fullContextBlock || '').length) {
          (stats as any).domainExpertLens = effectiveContext.slice((fullContextBlock || '').length);
        }
      }
    } catch (expertErr) {
      console.warn(`${label} DOMAIN EXPERT: failed (non-blocking):`, expertErr instanceof Error ? expertErr.message : expertErr);
    }
  } else if (!expertFitsReserve) {
    (stats as any).domainExpert = { skippedReason: 'repair_reserve' };
    console.log(`${label} DOMAIN EXPERT: skipped — pass would consume the reserved repair tail`);
  }

  if (!analysis) {
    analysis = await durable('analyst', () => analystMultipass(query, topSources, slimReadings, {
      contextBlock: effectiveContext || undefined,
      domain: detectedDomain,
      depth: isStrategic ? "strategic" : "brief",
      // Evidence-bound thesis — the pre-draft review checks the pass-1
      // direction against it before passes 2-3 invest in the draft.
      boundThesis: (stats as any).thesisBinding?.statement,
      // Per-pass checkpoints inside the multipass: the 'analyst' outer step
      // still caches the final result; inner passes bound the loss window to
      // ~1 pass instead of the whole 3-pass run when the worker dies mid-way.
      durableStep: durable,
    }));
    bumpAnalysisArtifact();
  }

  // S14-G: Test-Time Scaling (ICLR 2026 — Zeng et al.)
  // For strategic queries with sufficient budget, generate a second candidate
  // and pick the one with better citation coverage. This is a simplified version
  // of the asymmetric verification pattern: generate N candidates (cheap, parallel),
  // verify deterministically (citation count), select the best.
  // Wall-clock guard: a second candidate is a full 3-pass (~7-10min). It must
  // fit its own duration AND leave the reserved repair tail intact — an
  // unjudged extra candidate is pure waste (S34 timeout finding). The old flat
  // headroom conflated step cost and tail; now duration + REPAIR_TAIL_RESERVE.
  const ttsDurationMs = Number(process.env.TTS_DURATION_MS ?? 600_000);
  const ttsHasTime = hasRunHeadroomWithReserve(pipelineStart, isStrategic, ttsDurationMs);
  if (isStrategic && !ttsHasTime) {
    stats.testTimeScaling = { activated: false, skippedReason: 'insufficient_headroom' };
    console.log(`${label} TEST-TIME SCALING: skipped — ${Math.round(remainingRunMs(pipelineStart, isStrategic) / 60000)}min left, second candidate would overrun the deadline tail`);
  }
  if (isStrategic && ttsHasTime && runningCostUsd < (maxBudgetUsd ?? 5) * 0.4 && !analysis?._meta?.failed) {
    try {
      console.log(`${label} TEST-TIME SCALING: generating second candidate for comparison...`);
      const candidate2 = await analystMultipass(query, topSources, slimReadings, {
        contextBlock: effectiveContext || undefined,
        domain: detectedDomain,
        depth: "strategic",
        boundThesis: (stats as any).thesisBinding?.statement,
      });
      // Candidate selection by structural coverage — the outline critic scores
      // how much of the question's required dimensions each analysis actually
      // covers (~$0.005/candidate). Citation count is a weak proxy: a verbose
      // narrower analysis out-cites a better one while missing whole branches
      // (the failure mode the DA later kills on).
      let cover1: number | null = null;
      let cover2: number | null = null;
      try {
        const { critiqueOutline } = await import('../outline-critic');
        const [o1, o2] = await Promise.all([
          critiqueOutline(query, analysis, topSources.length),
          critiqueOutline(query, candidate2, topSources.length),
        ]);
        cover1 = o1?.coverageScore ?? null;
        cover2 = o2?.coverageScore ?? null;
        addCost((o1?.costUsd ?? 0) + (o2?.costUsd ?? 0), 'TTS_OUTLINE_SCORING');
      } catch { /* fall back to citation proxy */ }
      const citeCount1 = Array.from((analysis as any).html?.matchAll(/\[SRC-\d+\]/g) ?? []).length;
      const citeCount2 = Array.from((candidate2 as any).html?.matchAll(/\[SRC-\d+\]/g) ?? []).length;
      const len1 = (analysis as any).html?.length ?? 0;
      const len2 = (candidate2 as any).html?.length ?? 0;
      // Prefer real coverage when both scored; citation count fallback otherwise.
      const c2Wins = (cover1 !== null && cover2 !== null)
        ? cover2 > cover1
        : (citeCount2 > citeCount1 || (citeCount2 === citeCount1 && len2 > len1 * 1.1));
      if (c2Wins) {
        console.log(`${label} TEST-TIME SCALING: candidate 2 selected (coverage: ${cover2 ?? '?'} vs ${cover1 ?? '?'}, cites: ${citeCount2} vs ${citeCount1})`);
        analysis = candidate2;
        bumpAnalysisArtifact();
      } else {
        console.log(`${label} TEST-TIME SCALING: candidate 1 kept (coverage: ${cover1 ?? '?'} vs ${cover2 ?? '?'}, cites: ${citeCount1} vs ${citeCount2})`);
      }
      stats.testTimeScaling = {
        activated: true, candidatesCompared: 2,
        coverageScores: cover1 !== null || cover2 !== null ? { c1: cover1, c2: cover2 } : undefined,
        winnerCitations: Math.max(citeCount1, citeCount2),
      };
    } catch (ttsErr) {
      console.warn(`${label} TEST-TIME SCALING: failed (non-blocking):`, ttsErr instanceof Error ? ttsErr.message : String(ttsErr));
    }
  }
  const analystCostUsd = typeof analysis._meta?.totalCostUsd === "number" ? analysis._meta.totalCostUsd : undefined;
  stats.analyst = {
    hasDebate: !!analysis.causalChain?.length,
    passes: 3,
    costUsd: analystCostUsd,
    depth: isStrategic ? "strategic" : "brief",
  };
  addCost(analystCostUsd, `ANALYST MULTIPASS (${isStrategic ? 'strategic' : 'brief'})`);
  ctx.setAnalystOutput(analysis);
  ctx.recordAgentTiming('ANALYST', Date.now() - pipelineStart);

  return { analysis, analystCostUsd };
}
