/**
 * PERSISTENCE TAIL — everything after the quality gates converge:
 * PUBLISHER (brief.create) → post-publish writes (parallel) → prediction
 * auditor → source reputation → experience bank → eval-freshness assert →
 * pipelineRun.update → durable seal → learning loop → skill bank → lesson
 * verifier → flag-gated post-run learning (parallel) → MOA weight update.
 *
 * Extracted verbatim from pipeline-v2; the caller keeps the return-object
 * construction (readerClaims, removeListener). `html` is returned because the
 * CSS-selector fix mutates it before persistence.
 */

import { prisma, withDbRetry } from '../../db';
import { assertExecutionActive, withExecutionDetached } from '../../worker/execution-scope';
import { extractAndStoreConcepts } from '../knowledge-graph';
import { extractAndStoreGaps, markGapsFilled } from '../gap-filler';
import { recordSourceUsage } from '../source-reputation-agent';
import { registerPredictions } from '../prediction-registration';
import { recordAgentPerformance, extractLessons, storeLesson, recordLearningCycle } from '../agent-memory';
import { markDurableComplete } from '../durable-execution';
import { updateAgentWeights } from '../moa/mixture-of-agents';
import { updateWorldModel } from '../world-model/world-model';
import { runEvolutionCycle } from '../self-evolver';
import { retrainPRM } from '../prm/process-reward-model';
import { evaluateBriefRAG } from '../ragas-eval';
import type { DomainExpertise } from '../researcher-kb/index';

export interface PersistenceTailDeps {
  label: string;
  isStrategic: boolean;
  query: string;
  html: string;
  stats: Record<string, any>;
  topSources: any[];
  analysis: any;
  detectedDomain: string;
  foundationalSources: any[];
  pipelineRun: { id: string };
  orchState: { trustScore: number | null | undefined; decisions: unknown[] };
  episodicContext: any[] | null | undefined;
  pipelineStart: number;
  runningCostUsd: number;
  savedScatterResult: any;
  useTemporalMemory: boolean;
  ctx: { getSummary: () => any };
  emitProgress: (runId: string, step: import('../pipeline-progress').PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  collectStaleEvaluations: () => string[];
  analysisArtifactVersion: number;
  htmlArtifactVersion: number;
  durableKey: string | null;
  memoryBlock: string | undefined;
  readerMemoryBlock: string | undefined;
  readings: any[];
  // flag-gated post-run learning
  witnessCtx: any;
  useWorldModel: boolean;
  worldModelControversies: any[];
  usePRM: boolean;
  prmModel: { trainingExamples: number } | null;
  useRagasEval: boolean;
  useSelfEvolution: boolean;
  useMixtureOfAgents: boolean;
  addCost: (usd: number | undefined, step: string) => void;
}

export async function runPersistenceTail(deps: PersistenceTailDeps): Promise<{ briefId: string; html: string }> {
  assertExecutionActive();
  const {
    label, isStrategic, query, stats, topSources, analysis, detectedDomain,
    foundationalSources, pipelineRun, orchState, episodicContext, pipelineStart,
    runningCostUsd, savedScatterResult, useTemporalMemory, ctx, emitProgress,
    collectStaleEvaluations, analysisArtifactVersion, htmlArtifactVersion,
    durableKey, memoryBlock, readerMemoryBlock, readings,
    witnessCtx, useWorldModel, worldModelControversies, usePRM, prmModel,
    useRagasEval, useSelfEvolution, useMixtureOfAgents, addCost,
  } = deps;
  let html = deps.html;

  // ── STEP 14: PUBLISHER ──
  console.log(`${label} PUBLISHER: save ${isStrategic ? "strategic report" : "brief"}`);
  const estimatedPages = isStrategic ? Math.round(html.length / 3000) : undefined;

  // CSS fix: ensure `article.nomosx-brief` selectors are not split by a space
  // (some CSS processing steps insert a space, turning compound selectors into
  // descendant selectors, which breaks the grid background)
  html = html.replace(/article\s+\.nomosx-brief/g, 'article.nomosx-brief');

  const sanitizeForJson = (str: string): string => {
    // Remove control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F) that break JSON serialization
    // Keep tab (0x09), LF (0x0A), CR (0x0D) as they are valid in JSON strings
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  };
  // Foundational KB sources have synthetic ids (never persisted as rows).
  // Keep their metadata in lineage so readers can hydrate them and preserve
  // [SRC-N] ordering for the whole brief.sources array.
  if (foundationalSources.length > 0) {
    (stats as Record<string, unknown>).foundationalSources = foundationalSources.map((fs) => ({
      id: fs.id,
      title: fs.title,
      authors: fs.authors,
      year: fs.year,
      doi: fs.doi,
      url: fs.url,
      provider: fs.provider,
      qualityScore: fs.qualityScore,
    }));
  }
  const safeHtml = sanitizeForJson(html);
  let safeStats: any;
  try {
    safeStats = JSON.parse(sanitizeForJson(JSON.stringify(stats)));
  } catch {
    // Fallback: strip complex nested objects that may cause circular refs
    safeStats = { error: 'stats serialization failed', keys: Object.keys(stats) };
  }
  const brief = await withDbRetry(() =>
    prisma.brief.create({
      data: {
        kind: isStrategic ? "strategic" : "brief",
        question: query,
        html: safeHtml,
        sources: topSources.map((s: any) => s.id),
        pipelineRunId: pipelineRun.id,
        lineage: safeStats as any,
        publicId: null,
        trustScore: (orchState.trustScore ?? 0) / 100,
      },
    })
  );
  stats.brief = { id: brief.id, ...(estimatedPages && { estimatedPages }) };

  // ── POST-PUBLISH WRITES — independent persistence, run in parallel ──
  // All six only need `brief.id` (created above), write distinct stats keys,
  // keep their own try/catch, and are awaited before the final pipelineRun
  // update which persists the stats bag. The KG extraction is an LLM call —
  // running it concurrently with the DB writes removes its wall-time.
  await Promise.allSettled([

    // T10: Register predictions in the Prediction table for retrospective auditing
    (async () => {
      try {
        const pruningResult = (analysis as any)?._meta?.pruning;
        const predResult = await registerPredictions(brief.id, analysis as any, pruningResult, topSources);
        stats.predictions = { registered: predResult.registered } as any;
        if (predResult.registered > 0) {
          console.log(`${label} PREDICTIONS: registered ${predResult.registered} predictions for brief ${brief.id}`);
        }
      } catch (err) {
        console.warn(`${label} PREDICTIONS: registration failed (non-blocking):`, err);
      }
    })(),

    // F-B17: Persist causal chain to DB for retrospective auditing and visualization
    (async () => {
      try {
        const chain = (analysis as any)?.causalChain;
        if (Array.isArray(chain) && chain.length > 0) {
          const values = chain.map((link: any, i: number) => {
            const claim = String(link.claim || "").replace(/'/g, "''").slice(0, 5000);
            const evidence = String(link.evidence || "").replace(/'/g, "''").slice(0, 5000);
            const warrant = String(link.warrant || "").replace(/'/g, "''").slice(0, 5000);
            const temporalStatus = String(link.temporalStatus || "established").replace(/'/g, "''");
            // derivesFrom and sourceRef are Int? columns — use NULL or the integer value.
            // link.id is a STRING (e.g., "src-1") and must NOT be used as linkIndex (Int column).
            // Use the array index i as the linkIndex instead.
            const derivesFrom = (typeof link.derivesFrom === 'number' && !isNaN(link.derivesFrom)) ? link.derivesFrom : 'NULL';
            const sourceRef = (typeof link.sourceRef === 'number' && !isNaN(link.sourceRef)) ? link.sourceRef : 'NULL';
            const unsupported = Boolean(link.unsupported);
            const linkIndex = i;
            // CRITICAL: The "id" column has @default(cuid()) but raw SQL INSERT does NOT
            // trigger Prisma defaults. We must generate the cuid explicitly.
            // Using crypto.randomUUID() as a safe alternative to cuid().
            const id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
            return `('${id}', '${brief.id.replace(/'/g, "''")}', ${linkIndex}, '${claim}', '${evidence}', '${warrant}', '${temporalStatus}', ${derivesFrom}, ${sourceRef}, ${unsupported})`;
          });
          // NOTE: "createdAt" has @default(now()) in the schema — do NOT include it in the INSERT.
          // The "id" column also has @default(cuid()) but raw SQL doesn't trigger it, so we generate it.
          await prisma.$executeRawUnsafe(
            `INSERT INTO "CausalLink" ("id", "briefId", "linkIndex", "claim", "evidence", "warrant", "temporalStatus", "derivesFrom", "sourceRef", "unsupported") VALUES ${values.join(", ")}`
          );
          console.log(`${label} CAUSAL LINKS: persisted ${chain.length} links for brief ${brief.id}`);
        }
      } catch (err) {
        console.warn(`${label} CAUSAL LINKS: persistence failed (non-blocking):`, err);
      }
    })(),

    // ── STEP 15: KNOWLEDGE GRAPH (post-publish concept extraction) ──
    (async () => {
      console.log(`${label} KNOWLEDGE GRAPH: extracting concepts`);
      try {
        const kg = await extractAndStoreConcepts(brief.id, query, html, topSources.map((s: any) => s.id), useTemporalMemory);
        stats.knowledgeGraph = { entities: kg.concepts.length, relations: kg.relations.length, clusters: 0, bridges: 0, costUsd: kg.costUsd };
        console.log(`${label} KNOWLEDGE GRAPH: ${kg.concepts.length} concepts, ${kg.relations.length} relations`);
      } catch (err) {
        console.warn(`${label} KNOWLEDGE GRAPH: failed (non-blocking):`, err);
      }
    })(),

    // STEP 16: GAP FILLER — extract knowledge gaps from this analysis for future runs
    (async () => {
      try {
        const gapResult = await extractAndStoreGaps(query, html, detectedDomain, pipelineRun.id, topSources.length);
        if (gapResult.gaps.length > 0) {
          console.log(`${label} GAP FILLER: identified ${gapResult.gaps.length} knowledge gaps for future runs`);
        }
        // Mark prior gaps that were relevant as filled
        await markGapsFilled(pipelineRun.id, detectedDomain, topSources.length);
      } catch (err) {
        console.warn(`${label} GAP FILLER: extraction failed (non-blocking):`, err);
      }
    })(),

    // STEP 16b: EPISODIC MEMORY STORAGE (V3.1) — store this run for future learning
    (async () => {
      try {
        const { storeEpisode } = await import('../episodic-memory');
        await storeEpisode({
          query,
          researchQuestion: query,
          sourceCount: topSources.length,
          providerDiversity: new Set(topSources.map((s: any) => s.provider)).size,
          criticScore: stats.critic?.overallScore ?? null,
          criticVerdict: stats.critic?.verdict ?? null,
          keyFindings: [],
          mistakes: episodicContext?.filter((e: any) => e.episode.criticScore && e.episode.criticScore < 40).map((e: any) => e.lesson) ?? [],
          successes: episodicContext?.filter((e: any) => e.episode.criticScore && e.episode.criticScore >= 75).map((e: any) => e.lesson) ?? [],
          domains: [detectedDomain || 'general'],
          durationMs: Date.now() - pipelineStart,
          costUsd: runningCostUsd,
          briefId: brief.id,
        });
        console.log(`${label} EPISODIC MEMORY: episode stored for brief ${brief.id}`);
      } catch (err) {
        console.warn(`${label} EPISODIC MEMORY: storage failed (non-blocking):`, err);
      }
    })(),

    // STEP 16c: PREDICTION TRACKER (V3.1) — store SCATTER hypotheses for calibration
    (async () => {
      if (savedScatterResult?.hypotheses?.length > 0) {
        try {
          const { storePredictionsFromHypotheses } = await import('../prediction-tracker');
          await storePredictionsFromHypotheses(
            brief.id,
            query,
            savedScatterResult.hypotheses.map((h: any) => ({
              name: h.category || h.name || 'scenario',
              description: h.statement || h.hypothesis || h.description || '',
              probability: h.probability || 0.5,
              horizon: '5-10 years',
              secondOrderEffects: h.secondOrderEffects,
            })),
            detectedDomain || 'general',
          );
          console.log(`${label} PREDICTION TRACKER: stored ${savedScatterResult.hypotheses.length} hypotheses`);
        } catch (err) {
          console.warn(`${label} PREDICTION TRACKER: storage failed (non-blocking):`, err);
        }
      }
    })(),
  ]);

  // STEP 17: PREDICTION AUDITOR — retrospectively check past predictions against new evidence
  // Runs asynchronously (non-blocking) to avoid slowing down the pipeline
  import('../prediction-auditor').then(({ runPredictionAuditor }) => {
    runPredictionAuditor({ lookbackDays: 180, minProbability: 0.5 })
      .then(audit => {
        if (audit.audited > 0) {
          console.log(`${label} PREDICTION AUDITOR: ${audit.audited} predictions audited (${audit.confirmed} confirmed, ${audit.falsified} falsified, avg accuracy ${audit.avgAccuracyScore}/100)`);
        }
      })
      .catch(err => console.warn(`${label} PREDICTION AUDITOR: failed (non-blocking):`, err));
  }).catch(() => {});

  // P3-M: Record source usage for reputation learning (non-blocking)
  // Extract actually-cited source IDs from [E-N] evidence IDs and <sup> tags in HTML
  // (replaceSrcWithEvidenceIds has already converted [SRC-N] → [E-N] / <sup data-evidence="EN">)
  // Fallback: if conversion failed, also check for remaining [SRC-N] patterns
  const citeFreq = new Map<number, number>();
  const countRef = (m: RegExpMatchArray) => {
    const i = parseInt(m[1], 10) - 1;
    citeFreq.set(i, (citeFreq.get(i) ?? 0) + 1);
  };
  for (const m of html.matchAll(/\[E(\d+)\]/g)) countRef(m);
  for (const m of html.matchAll(/\[SRC-(\d+)\]/g)) countRef(m);
  for (const m of html.matchAll(/data-evidence="E(\d+)"/g)) countRef(m);
  for (const m of html.matchAll(/href="#ref-(\d+)"/g)) countRef(m);
  const citedIndices = Array.from(citeFreq.keys()).filter(i => i >= 0 && i < topSources.length);
  const citedSourceIds = citedIndices.map(i => (topSources[i] as any).id);
  // The sources actually cited in the artifact are a better quality proxy than
  // the ranked-pool average (which is diluted by the long tail). Weight by
  // citation FREQUENCY: a source referenced five times carries the report's
  // argument; a once-mentioned tail source does not contribute equally.
  // Persisted for extractPipelineScores — see citedSourceQuality below.
  if (citedIndices.length >= 4) {
    let weighted = 0, totalWeight = 0;
    for (const i of citedIndices) {
      const w = citeFreq.get(i) ?? 1;
      const s = topSources[i] as any;
      // Fall back to the richer source-quality score when the provider score
      // is missing — an unscored source should not count as a 0-quality one.
      weighted += ((s.qualityScore || 0) > 0 ? s.qualityScore : (s.sourceQuality?.overall || 0)) * w;
      totalWeight += w;
    }
    stats.citedSourceQuality = { cited: citedIndices.length, avgQuality: Math.round(weighted / Math.max(1, totalWeight)) };
  }
  recordSourceUsage(
    topSources.map((s: any) => s.id),
    stats.criticalLoop?.finalScore ?? 0,
    citedSourceIds,
  ).catch(() => {});

  // ── EXPERIENCE BANK: extraction moved post-gate ──
  // The meta-learner must see the FINAL disposition (published/held/ready +
  // gate reasons), not in-flight trust — otherwise a held run's lessons are
  // indistinguishable from a published one's. The call now lives in the
  // inquiry orchestrator, after the gate/regen/status resolution, where the
  // outcome is known. (Audit finding: learning captured before the verdict.)

  // ── EVALUATION FRESHNESS ASSERT (P0/1) ──
  // Every tagged evaluation is checked against the artifact version it judged.
  // A stale verdict (attached to a replaced artifact — the S27 bug class) is
  // marked `.stale` in stats so the gate cannot silently consume it.
  const staleEvals = collectStaleEvaluations();
  stats.evaluationFreshness = {
    stale: staleEvals,
    verdictStale: staleEvals.filter(k => k === 'critic' || k === 'criticPanel' || k === 'devilsAdvocate'),
    analysisArtifactVersion,
    htmlArtifactVersion,
  };
  if (staleEvals.length > 0) {
    console.error(`${label} EVAL FRESHNESS: ${staleEvals.length} stale evaluation(s) detected — ${staleEvals.join(', ')} judged a replaced artifact (analysis v${analysisArtifactVersion}, html v${htmlArtifactVersion})`);
  } else {
    console.log(`${label} EVAL FRESHNESS: all evaluations match current artifacts (analysis v${analysisArtifactVersion}, html v${htmlArtifactVersion})`);
  }

  // Finalize PipelineRun
  const totalCost = runningCostUsd;
  stats.totalCostUsd = totalCost;
  stats.blackboard = ctx.getSummary();

  const durationMs = Date.now() - pipelineStart;
  emitProgress(pipelineRun.id, "COMPLETE", "completed", `Pipeline complete in ${(durationMs / 1000).toFixed(1)}s`, { costUsd: totalCost, durationMs, blackboard: ctx.getSummary() });
  // Retry transient failures, but never throw past this point: the brief is
  // already committed — a dropped run-status write must not orphan it.
  await withDbRetry(() =>
    prisma.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        durationMs,
        totalCostUsd: totalCost,
        sourcesFound: stats.scout?.found || 0,
        sourcesRanked: stats.rank?.count || 0,
        sourcesUsed: topSources.length,
        trustScore: stats.criticalLoop?.finalScore ?? null,
        steps: JSON.parse(JSON.stringify({ ...stats, orchestrator: { ...stats.orchestrator, decisions: orchState.decisions } })),
      },
    })
  ).catch((err) =>
    console.warn(`${label} PERSISTENCE: pipelineRun COMPLETED update failed (non-blocking — brief ${stats.brief?.id} is safe):`, err)
  );

  // DURABLE: run reached a verdict (publish or held) — seal checkpoints so a
  // later run of the same query+format starts fresh. A killed/timed-out run
  // never reaches this line, so its checkpoints stay open for resume.
  if (durableKey) markDurableComplete(durableKey).catch(() => {});

  // ── LEARNING LOOP: Record performance + extract lessons (closes the feedback loop) ──
  // This is the WRITE side of agent memory — without this, agents never learn.
  // Inspired by Reflexion (NeurIPS 2023): verbal reinforcement learning.
  const finalTrustScore = stats.criticalLoop?.finalScore ?? 0;
  const finalQualityScore = (stats.criticalLoop as any)?.qualityScore ?? finalTrustScore;
  const confidenceGiven = (analysis as any)?.confidenceLevel === 'high' ? 85 :
                          (analysis as any)?.confidenceLevel === 'medium' ? 65 : 40;
  const citationCoverage = topSources.length > 0
    ? Array.from(new Set([
        ...Array.from(html.matchAll(/\[E(\d+)\]/g)).map(m => parseInt(m[1], 10)),
        ...Array.from(html.matchAll(/\[SRC-(\d+)\]/g)).map(m => parseInt(m[1], 10)),
      ])).length / topSources.length
    : 0;
  const appliedLessonTexts = memoryBlock ? [memoryBlock] : [];
  withExecutionDetached(() => recordLearningCycle({
    agentId: isStrategic ? "strategic-analyst" : "analyst",
    runId: pipelineRun.id,
    question: query,
    domain: detectedDomain as DomainExpertise,
    trustScore: finalTrustScore,
    qualityScore: finalQualityScore,
    confidenceGiven,
    confidenceActual: finalTrustScore,
    citationCoverage,
    findingsCount: (analysis as any)?.keyFindings?.length || 0,
    contradictionsFound: stats.debate ? 1 : 0,
    sourceDiversity: new Set(topSources.map((s: any) => s.provider)).size,
    agentOutputExcerpt: html.slice(0, 2000),
    appliedLessonTexts,
  })).catch((err) => console.warn(`${label} LEARNING LOOP: failed (non-blocking):`, err));
  // Also record for READER agent
  if (readings.length > 0) {
    withExecutionDetached(() => recordLearningCycle({
      agentId: "reader",
      runId: pipelineRun.id,
      question: query,
      domain: detectedDomain as DomainExpertise,
      trustScore: finalTrustScore,
      qualityScore: finalQualityScore,
      confidenceGiven: 70,
      confidenceActual: finalTrustScore,
      citationCoverage,
      findingsCount: readings.length,
      contradictionsFound: 0,
      sourceDiversity: new Set(topSources.map((s: any) => s.provider)).size,
      agentOutputExcerpt: JSON.stringify(readings.slice(0, 3)).slice(0, 1000),
      appliedLessonTexts: readerMemoryBlock ? [readerMemoryBlock] : [],
    })).catch(() => {});
  }

  // S14-B: Close the learning loop — record performance + extract lessons
  // These were imported but never called, leaving the learning loop open.
  // Now: (1) record performance for calibration, (2) extract lessons from this run.
  // These record calls are fire-and-forget durability writes — detach them or
  // they die with 'scope closed' when the tail outlives the pipeline scope.
  withExecutionDetached(() => recordAgentPerformance({
    agentId: isStrategic ? "strategic-analyst" : "analyst",
    domain: detectedDomain as DomainExpertise,
    runId: pipelineRun.id,
    question: query,
    trustScore: finalTrustScore,
    qualityScore: finalQualityScore,
    confidenceGiven,
    confidenceActual: finalTrustScore,
    citationCoverage,
    findingsCount: (analysis as any)?.keyFindings?.length || 0,
    failureModes: [],
    lessonsLearned: [],
  })).catch((err) => console.warn(`${label} LEARNING LOOP: recordAgentPerformance failed:`, err));

  if (readings.length > 0) {
    withExecutionDetached(() => recordAgentPerformance({
      agentId: "reader",
      domain: detectedDomain as DomainExpertise,
      runId: pipelineRun.id,
      question: query,
      trustScore: finalTrustScore,
      qualityScore: finalQualityScore,
      confidenceGiven: 70,
      confidenceActual: finalTrustScore,
      citationCoverage,
      findingsCount: readings.length,
      failureModes: [],
      lessonsLearned: [],
    })).catch(() => {});
  }

  // Extract lessons from this run if quality was low (learning opportunity)
  if (finalTrustScore < 75 && html.length > 1000) {
    const agentId = isStrategic ? "strategic-analyst" : "analyst";
    withExecutionDetached(() => extractLessons(
      agentId,
      query,
      html.slice(0, 4000),
      {
        trustScore: finalTrustScore,
        qualityScore: finalQualityScore,
        failureModes: finalTrustScore < 60 ? ['overconfident' as any] : [],
      },
      detectedDomain as DomainExpertise,
    )).then(({ lessons, structured }) => {
      if (lessons && lessons.length > 0) {
        console.log(`${label} LEARNING LOOP: extracted ${lessons.length} lessons from this run`);
        for (const lesson of lessons.slice(0, 3)) {
          const meta = structured?.find(s => s.lesson === lesson);
          storeLesson(agentId, lesson, pipelineRun.id, detectedDomain as DomainExpertise, 1.0,
            meta ? { trigger: meta.trigger, procedure: meta.procedure } : undefined).catch(() => {});
        }
      }
    }).catch((err) => console.warn(`${label} LEARNING LOOP: extractLessons failed:`, err));
  }

  // ── SKILL BANK: record the winning configuration when trust is high ──
  // Procedural memory: domain → (providers + lens types) that produced trust ≥ 80.
  if (finalTrustScore >= 80) {
    try {
      const { recordSkill } = await import('../skill-bank');
      recordSkill({
        domain: detectedDomain as string,
        providers: [...new Set(topSources.map((s: any) => String(s.provider)))],
        lensTypes: (stats as any).intelligentScout?.lenses?.map((l: any) => l.type) ?? [],
        trustScore: finalTrustScore,
        runId: pipelineRun.id,
      }).catch(() => {});
      console.log(`${label} SKILL BANK: recorded winning config (trust=${finalTrustScore}, domain=${detectedDomain})`);
    } catch { /* non-blocking */ }
  }

  // S14-C: Lesson verification (LUCID 2026) — periodically verify accumulated lessons
  // to prevent memory reward inflation. Runs every 10th run for each agent.
  if (Math.random() < 0.1) { // 10% chance per run ≈ every 10 runs
    try {
      const { verifyAndDeInflateLessons } = await import('../lesson-verifier');
      const agentId = isStrategic ? "strategic-analyst" : "analyst";
      const result = await verifyAndDeInflateLessons(agentId, {
        question: query,
        agentOutputExcerpt: html.slice(0, 1000),
      });
      if (result.deInflatedCount > 0 || result.prunedCount > 0) {
        console.log(`${label} LESSON VERIFIER: de-inflated ${result.deInflatedCount}, pruned ${result.prunedCount} lessons (avg score ${result.avgScore}%)`);
      }
    } catch (err) {
      console.warn(`${label} LESSON VERIFIER: failed (non-blocking):`, err);
    }
  }

  if (isStrategic) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ✅ STRATEGIC REPORT COMPLETE`);
    console.log(`  Brief: ${brief.id} | Run: ${pipelineRun.id}`);
    console.log(`  Sources: ${topSources.length} | Pages: ~${estimatedPages}`);
    console.log(`  Cost: $${totalCost.toFixed(4)} | Duration: ${durationMs}ms`);
    console.log(`  Orchestrator: ${orchState.decisions.length} decisions`);
    console.log(`${"═".repeat(60)}\n`);
  } else {
    console.log(`${label} DONE: brief ${brief.id} | run ${pipelineRun.id} | $${totalCost.toFixed(4)} | ${durationMs}ms | ${orchState.decisions.length} orchestrator decisions`);
  }

  // ── POST-RUN LEARNING WRITES — flag-gated, independent, run in parallel ──
  // witness.finalize / worldModel / PRM retrain / RAGAS / selfEvolution only
  // need the finished artifacts; each keeps its own try/catch and writes a
  // distinct stats key. The MOA weight update stays AFTER the barrier: it
  // reads stats.witness.qualityScore as its quality signal.
  await Promise.allSettled([

    // ── WITNESS: Finalize — extract cross-run learnings ──
    (async () => {
      if (!witnessCtx) return;
      try {
        const witnessResult = await witnessCtx.finalize(query);
        console.log(`${label} WITNESS: run complete — health=${witnessResult.healthScore}/100, anomalies=${witnessResult.totalAnomalies}, interventions=${witnessResult.totalInterventions}, quality=${witnessResult.qualityScore}/100${witnessResult.recommendsChanges ? ' (changes recommended for future runs)' : ''}`);
        (stats as any).witness = witnessResult;
      } catch (err) {
        console.warn(`${label} WITNESS: finalize failed:`, err);
      }
    })(),

    // ── WORLD MODEL: Update with findings from this run ──
    (async () => {
      if (!(useWorldModel && analysis)) return;
      try {
        const analysisText = typeof analysis === 'string' ? analysis :
          (analysis.summary || '') + '\n' + (analysis.consensus || '') + '\n' + (analysis.debate?.synthesis || '');
        // Identify domains from the query
        const domains = worldModelControversies.length > 0 ? ['general'] : ['general'];
        await updateWorldModel(query, analysisText, topSources.map((s: any) => ({
          id: s.id, title: s.title, abstract: s.abstract, provider: s.provider,
        })), domains);
        console.log(`${label} WORLD_MODEL: updated with findings from this run`);
      } catch (err) {
        console.warn(`${label} WORLD_MODEL: update failed:`, err);
      }
    })(),

    // ── PRM: Retrain periodically (every 10 runs) ──
    (async () => {
      if (!usePRM) return;
      try {
        // Check if we should retrain (simple heuristic: retrain if model is old or has enough new data)
        const shouldRetrain = !prmModel || prmModel.trainingExamples < 100;
        if (shouldRetrain) {
          console.log(`${label} PRM: retraining model...`);
          const newModel = await retrainPRM();
          if (newModel) {
            console.log(`${label} PRM: model retrained (${newModel.trainingExamples} examples)`);
          }
        }
      } catch (err) {
        console.warn(`${label} PRM: retrain failed:`, err);
      }
    })(),

    // ── RAGAS EVAL: 2026 RAG quality metrics ──
    (async () => {
      if (!useRagasEval) return;
      try {
        const ragas = await evaluateBriefRAG(query, html, topSources);
        (stats as any).ragas = {
          overall: ragas.metrics.overall,
          faithfulness: ragas.metrics.faithfulness,
          answerRelevancy: ragas.metrics.answerRelevancy,
          contextPrecision: ragas.metrics.contextPrecision,
          contextRecall: ragas.metrics.contextRecall,
          explanation: ragas.explanation,
        };
        addCost(ragas.costUsd, 'RAGAS EVAL');
        console.log(`${label} RAGAS EVAL: overall=${ragas.metrics.overall}%, faithfulness=${ragas.metrics.faithfulness}%, relevancy=${ragas.metrics.answerRelevancy}%`);
      } catch (err) {
        console.warn(`${label} RAGAS EVAL: failed (non-blocking):`, err);
      }
    })(),

    // ── SELF-EVOLUTION: prompt evolution for key agents (non-blocking) ──
    (async () => {
      if (!useSelfEvolution) return;
      try {
        const fallbackFor = (id: string) => `[${id}] default system prompt — to be evolved from lessons`;
        const evolutionResults = await runEvolutionCycle(
          ['editorial_arbiter', 'analyst_brief', 'local_judge', 'citation_verifier'],
          fallbackFor,
        );
        (stats as any).selfEvolution = evolutionResults.filter(r => r.improved).map(r => ({
          agentId: r.agentId,
          version: r.newVersion?.version,
          delta: r.delta,
        }));
        const improved = evolutionResults.filter(r => r.improved).length;
        if (improved > 0) {
          console.log(`${label} SELF-EVOLUTION: ${improved} prompt(s) improved`);
        }
      } catch (err) {
        console.warn(`${label} SELF-EVOLUTION: failed (non-blocking):`, err);
      }
    })(),
  ]);

  // ── MOA: Update agent weights based on this run ──
  // AFTER the barrier — reads stats.witness.qualityScore as its quality signal.
  if (useMixtureOfAgents && (stats as any).moa) {
    try {
      const moaResult = (analysis as any)?._meta?.moaResult;
      if (moaResult) {
        const qualityScore = (stats as any).witness?.qualityScore
          ? (stats as any).witness.qualityScore / 100
          : 0.7;
        await updateAgentWeights(moaResult, qualityScore);
        console.log(`${label} MOA: agent weights updated`);
      }
    } catch (err) {
      console.warn(`${label} MOA: weight update failed:`, err);
    }
  }

  return { briefId: brief.id, html };
}
