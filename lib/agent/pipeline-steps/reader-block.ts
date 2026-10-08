/**
 * READER BLOCK — STEP 5: memory injection → parallel [reader V3, framing
 * (suppressed), quant, quant bridge] → stats → context compression →
 * evidence bank → fullText attach → orchestrator assess → self-correction
 * → DEEPEN → hypothesis judge → DPP synthesis → adaptive RAG →
 * round-table deliberation.
 *
 * `topSources` is mutated in place (fullText attach, DEEPEN). Everything
 * downstream needs is returned: readings + quant artifacts + the context
 * blocks that feed the analyst prompt.
 */

import { prisma } from '../../db';
import { assertExecutionActive } from '../../worker/execution-scope';
import { selfCorrectReader } from '../self-correction-integration';
import type { PipelineStep } from '../pipeline-progress';
import type { DomainExpertise } from '../researcher-kb/index';
import type { EvidenceBank } from '../evidence-bank';
import { buildMemoryInjection } from '../agent-memory';
import { isFreeRun } from '../../free-run';

export interface ReaderBlockDeps {
  topSources: any[];
  query: string;
  detectedDomain: string;
  isStrategic: boolean;
  runDeliberationStep: boolean;
  primedContext: any;
  stats: Record<string, any>;
  label: string;
  pipelineStart: number;
  pipelineRunId: string;
  durable: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  emitProgress: (runId: string, step: PipelineStep, status: 'completed' | 'started' | 'failed' | 'skipped', message: string, metadata?: Record<string, any>) => void;
  addCost: (usd: number | undefined, step: string) => void;
  ctx: {
    setReaderExtracts: (readings: any[]) => void;
    recordAgentTiming: (agent: string, ms: number) => void;
    addFinding: (agent: string, type: 'gap' | 'warning' | 'insight' | 'recommendation', content: string, metadata?: Record<string, unknown>) => void;
  };
  orchState: {
    sourcesWithAbstract: number;
    sourcesWithFullText: number;
    iteration: number;
    maxIterations: number;
  };
  assessAfterReader: (state: any) => any;
  recordDecision: (state: any, decision: any) => void;
  quantDepth: 'none' | 'parametric' | 'io' | 'full' | undefined;
  parametricInput: any;
  /** Regeneration path: readings from the prior attempt — reused for sources
   * already extracted; only sources without a prior reading are fetched. */
  priorReadings?: unknown[];
}

export interface ReaderBlockResult {
  readings: any[];
  framing: { hypotheses: any[]; keyUnknowns: string[]; costUsd: number };
  quant: any;
  quantBridge: any;
  readerMemoryBlock: string | undefined;
  evidenceBankBlock: string | undefined;
  evidenceBankRef: EvidenceBank | null;
  hypothesisVerdictBlock: string;
  dppContextBlock: string | null;
  roundTableBlock: string | null;
}

export async function runReaderBlock(deps: ReaderBlockDeps): Promise<ReaderBlockResult> {
  const {
    topSources, query, detectedDomain, isStrategic, runDeliberationStep,
    primedContext, stats, label, pipelineStart, pipelineRunId, durable,
    emitProgress, addCost, ctx, orchState, assessAfterReader, recordDecision,
    quantDepth, parametricInput,
  } = deps;

  // ── STEP 5: READER V3 + FRAMING + QUANT (parallel) ──
  emitProgress(pipelineRunId, "READER", "started", `Deep extraction from ${topSources.length} sources...`);
  console.log(`${label} READER V3: deep extraction from ${topSources.length} sources (domain: ${detectedDomain})`);
  // -- STEP 5a: AGENT MEMORY INJECTION for READER --
  let readerMemoryBlock: string | undefined;
  try {
    const readerMemInj = await buildMemoryInjection("reader", detectedDomain as DomainExpertise, { maxLessons: 3, lookbackDays: 90, topicQuery: query });
    if (readerMemInj.topLessons.length > 0) {
      readerMemoryBlock = readerMemInj.promptBlock;
      console.log(`${label} AGENT MEMORY (READER): ${readerMemInj.topLessons.length} lessons injected`);
    }
  } catch (err) { console.warn(`${label} AGENT MEMORY (READER): failed (non-blocking):`, err); }
  // READER runs in durable batches: the phase is the longest single step
  // (fetch + pdf-parse + LLM extract per source), and a crash mid-reader used
  // to lose everything back to the scout checkpoint. Each batch persists its
  // own checkpoint — a reclaim resumes at the first unfinished batch instead
  // of re-fetching the whole corpus, so repeated kills still converge.
  const READER_BATCH = 10;
  // Regeneration reuse: readings extracted by the prior attempt carry the same
  // evidence — re-fetching + re-extracting them is pure waste (~5-8min and the
  // embedding spend that pushed regens past their 25min child-scope cap). Only
  // sources lacking a prior reading (e.g. gap-fill additions) are extracted.
  const priorById = new Map<string, any>(
    (deps.priorReadings ?? [])
      .map((r: any) => [r?.sourceId, r] as const)
      .filter(([k]) => typeof k === 'string' && k.length > 0)
  );
  const priorReadingsBySourceId = priorById;
  // Free-run: the analyst only sees the top-10 corpus under free-tier request
  // caps — deep-reading 45 sources burns the daily TPM budget for context the
  // analyst never receives. Read the top-15 (small buffer vs the 10 shown).
  const readCap = isFreeRun() ? topSources.slice(0, 15) : topSources;
  const sourcesToRead = readCap.filter((s: any) => !priorById.has(s.id));
  if (priorById.size > 0) {
    console.log(`${label} READER V3: reusing ${topSources.length - sourcesToRead.length}/${topSources.length} prior readings — extracting ${sourcesToRead.length} new source(s) only`);
  }
  const readInBatches = async () => {
    const { readerAgentV3 } = await import('../reader-agent-v3');
    const fresh: any[] = [];
    for (let b = 0; b < sourcesToRead.length; b += READER_BATCH) {
      // Dead scope → stop extracting: a timed-out run was observed marching
      // through every remaining batch before unwinding.
      assertExecutionActive();
      const batchIdx = b / READER_BATCH;
      const slice = sourcesToRead.slice(b, b + READER_BATCH);
      // Batch names carry a corpus fingerprint: with priorReadings reuse the
      // batch contents differ from the attempt-1 layout, and a bare positional
      // key would replay the wrong checkpoint on durable resume.
      const part = await durable(`reader:b${batchIdx}:${String(slice[0]?.id ?? 'x').slice(-6)}`, () =>
        readerAgentV3(slice, {
          enablePdf: true,
          // Free runs route every call through one freepool endpoint (Groq
          // free tier: ~8K TPM). 4-5 concurrent ~3K-token extractions
          // guaranteed a 429 storm — pace at 2 so requests stay under quota.
          maxConcurrency: isFreeRun() ? 2 : 4,
          // Free runs queue behind TPM pacing — a 120s per-source timeout
          // aborts extractions mid-queue, burning the LLM call AND the slot.
          timeout: isFreeRun() ? 300000 : isStrategic ? 180000 : undefined,
          domain: detectedDomain,
          memoryBlock: readerMemoryBlock,
        })
      );
      if (Array.isArray(part)) fresh.push(...part);
      emitProgress(
        pipelineRunId, "READER", "started",
        `Batch ${batchIdx + 1}/${Math.ceil(sourcesToRead.length / READER_BATCH)} — ${fresh.length}/${sourcesToRead.length} new sources extracted`
      );
    }
    // Merge in topSources order: reused readings first-match by sourceId, fresh
    // extractions appended for sources that had none.
    const freshById = new Map<string, any>(fresh.map((r: any) => [r.sourceId, r]));
    const merged = topSources.map((s: any) => priorReadingsBySourceId.get(s.id) ?? freshById.get(s.id)).filter(Boolean);
    // Fresh extractions keyed differently (defensive — reader should always
    // set sourceId, but fall back to appending any unaccounted readings).
    for (const r of fresh) if (!merged.includes(r)) merged.push(r);
    return merged;
  };

  const [readings, framingSettled, quantSettled, quantBridgeSettled] = await Promise.all([
    readInBatches(),
    // FRAMING: SUPPRESSED — hypotheses not consumed by analyst, $0.03/run saved
    Promise.resolve({ hypotheses: [] as any[], keyUnknowns: [] as string[], costUsd: 0 }),
    // QUANT: fetch real numbers from T1 primary-data providers
    import('../quant-agent').then(m => m.quantAgent(query, topSources)).catch((err) => {
      console.warn(`${label} QUANT: failed (non-blocking):`, err);
      return { series: [], facts: [], evidenceBlock: '', chartData: [], fetchedProviders: [], durationMs: 0 };
    }),
    // QUANT BRIDGE: deterministic model layer (parametric costing + FIGARO IO multipliers)
    import('../../quant/quant-bridge').then(m => m.runQuantBridge(query, {
      depth: quantDepth ?? (isStrategic ? 'io' : 'none'),
      parametricInput,
    })).catch((err) => {
      console.warn(`${label} QUANT BRIDGE: failed (non-blocking):`, err);
      return { models: [] as any[], evidenceBlock: '', usedModels: [] as any[], durationMs: 0 };
    }),
  ]);
  const framing = framingSettled;
  const quant = quantSettled;
  const quantBridge = quantBridgeSettled;
  stats.quantBridge = { models: quantBridge.models.length, kinds: quantBridge.usedModels, durationMs: quantBridge.durationMs };
  if (quantBridge.models.length > 0) console.log(`${label} QUANT BRIDGE: ${quantBridge.models.length} deterministic model(s) [${quantBridge.usedModels.join(', ')}]`);
  addCost(framing.costUsd, 'FRAMING');
  stats.framing = { hypotheses: framing.hypotheses.length, keyUnknowns: framing.keyUnknowns.length, costUsd: framing.costUsd };
  stats.quant = { series: quant.series.length, facts: quant.facts.length, providers: quant.fetchedProviders, durationMs: quant.durationMs };
  if (framing.hypotheses.length > 0) console.log(`${label} FRAMING: ${framing.hypotheses.length} hypotheses pre-registered`);
  if (quant.facts.length > 0) console.log(`${label} QUANT: ${quant.facts.length} machine-verified facts from ${quant.fetchedProviders.join(', ')}`);
  const fullTextCount = readings.filter(r => r.readingDepth === "full_text").length;
  const quantCount = readings.filter(r => r.quantitative.effectSizes.length > 0 || r.quantitative.sampleSizes.length > 0).length;
  // S20/B: full depth breakdown persisted for groundedness trend tracking
  const depthBreakdown = {
    full_text: fullTextCount,
    abstract: readings.filter(r => r.readingDepth === "abstract").length,
    rule_based: readings.filter(r => r.readingDepth === "rule_based").length,
  };
  stats.reader = { count: readings.length, fullText: fullTextCount, withQuantData: quantCount, depth: depthBreakdown };
  ctx.setReaderExtracts(readings);
  ctx.recordAgentTiming('READER', Date.now() - pipelineStart);

  // ── CONTEXT COMPRESSION: Compress readings for downstream agents ──
  // IterResearch pattern: compress intermediate findings to fit context window
  try {
    const { compressReadings } = await import('../knowledge-infrastructure');
    const readingsForCompression = readings.slice(0, 30).map(r => ({
      sourceId: r.sourceId,
      claims: r.claims || [],
      methods: r.methods || [],
      results: r.results || [],
      limitations: r.limitations || [],
    }));
    if (readingsForCompression.length > 10) {
      const { compressed, costUsd: compressCost } = await compressReadings(readingsForCompression);
      stats.contextCompression = { originalSize: readingsForCompression.length, compressedSize: compressed.split(/\s+/).length, costUsd: compressCost };
      console.log(`${label} CONTEXT COMPRESSION: ${readingsForCompression.length} readings → ${compressed.split(/\s+/).length} words`);
    }
  } catch (err) {
    // Non-blocking
  }

  // ── EVIDENCE BANK (WebWeaver/Perplexity pattern) ──
  // Citations attach to extracted evidence AT READING TIME, not generation
  // time. The analyst is constrained to banked claims; post-render we flag
  // citations to sources that contributed no evidence (hallucination risk).
  let evidenceBankBlock: string | undefined;
  let evidenceBankRef: EvidenceBank | null = null;
  try {
    const { buildEvidenceBank, buildEvidenceBankBlock } = await import('../evidence-bank');
    evidenceBankRef = buildEvidenceBank(readings, topSources);
    if (evidenceBankRef.entries.length >= 8) {
      evidenceBankBlock = buildEvidenceBankBlock(evidenceBankRef);
      console.log(`${label} EVIDENCE BANK: ${evidenceBankRef.entries.length} entries across ${evidenceBankRef.perSource.size} sources`);
    }
    stats.evidenceBank = { entries: evidenceBankRef.entries.length, sourcesWithEvidence: evidenceBankRef.perSource.size };
  } catch (err) {
    console.warn(`${label} EVIDENCE BANK: build failed (non-blocking):`, err);
  }

  // Attach extractedText from READER V3 to topSources for claim grounding
  const readingByText = new Map(readings.map(r => [r.sourceId, r]));
  for (const src of topSources) {
    const r = readingByText.get((src as any).id);
    if (r?.extractedText) {
      (src as any).fullText = r.extractedText;
    }
  }

  orchState.sourcesWithAbstract = readings.filter(r =>
    r.claims.length > 0 || r.methods.length > 0 || r.results.length > 0 ||
    (r.extractedText && r.extractedText.length > 100) ||
    r.readingDepth === "abstract" || r.readingDepth === "full_text"
  ).length;
  orchState.sourcesWithFullText = fullTextCount;
  const readerDecision = assessAfterReader(orchState);
  recordDecision(orchState, readerDecision);
  stats.orchestrator = stats.orchestrator || { decisions: [] };
  stats.orchestrator.decisions.push(readerDecision);

  // ── SELF-CORRECTION: READER — assess quality, retry if low (Reflexion pattern) ──
  try {
    const readerSCInput = readings.map((r: any) => ({
      sourceId: r.sourceId,
      claims: r.claims || [],
      confidence: r.confidence || 'medium',
    }));
    const scResult = await selfCorrectReader({
      query,
      readings: readerSCInput,
      maxRetries: 1,
      retryFn: async (feedback: string) => {
        // Re-run reader with feedback injected via memoryBlock (durable: this
        // is a full corpus re-read — checkpoint it like the primary pass)
        const { readerAgentV3 } = await import('../reader-agent-v3');
        const reRead = await durable('reader:selfcorrect', () =>
          readerAgentV3(topSources, { memoryBlock: feedback, domain: detectedDomain }));
        return reRead.map((r: any) => ({
          sourceId: r.sourceId,
          claims: r.claims || [],
          confidence: r.confidence || 'medium',
        }));
      },
    });
    if (scResult.stats.triggered) {
      stats.selfCorrection = stats.selfCorrection || {};
      (stats.selfCorrection as any).reader = scResult.stats;
      addCost(scResult.stats.costUsd, 'SELF-CORRECTION (READER)');
      if (scResult.stats.improved) {
        // Replace readings with improved version
        const improvedReadings = scResult.readings;
        // Map back to full reading objects by sourceId
        for (const imp of improvedReadings) {
          const idx = readings.findIndex((r: any) => r.sourceId === imp.sourceId);
          if (idx >= 0 && imp.claims.length > readings[idx].claims.length) {
            readings[idx].claims = imp.claims;
          }
        }
        console.log(`${label} SELF-CORRECTION (READER): ${scResult.stats.originalScore} → ${scResult.stats.finalScore} after ${scResult.stats.retries} retry`);
      }
      // Log to AgentAuditLog for dashboard visibility
      prisma.agentAuditLog.create({
        data: {
          agent: 'reader',
          action: 'SELF_CORRECTION',
          metadata: JSON.stringify({
            phase: 'reader',
            originalScore: scResult.stats.originalScore,
            finalScore: scResult.stats.finalScore,
            retries: scResult.stats.retries,
            improved: scResult.stats.improved,
            issues: scResult.stats.issues.slice(0, 3),
          }),
        },
      }).catch(() => {}); // non-blocking
    }
  } catch (err) {
    console.warn(`${label} SELF-CORRECTION (READER): failed (non-blocking):`, err);
  }

  // ── ORCHESTRATOR ACTION: DEEPEN — was logged but never acted upon. NOW ACTED. ──
  if (readerDecision.action === "DEEPEN" && orchState.iteration < orchState.maxIterations) {
    console.log(`${label} ORCHESTRATOR: DEEPEN — ${readerDecision.reason}`);
    emitProgress(pipelineRunId, "READER", "started", `Deepening: extracting full-text for low-abstract sources...`);
    try {
      const sourcesNeedingFullText = topSources.filter((s: any) =>
        !s.abstract || s.abstract.length < 100
      ).slice(0, 8);
      let deepenedCount = 0;
      for (const source of sourcesNeedingFullText) {
        try {
          // Try to fetch full-text via available providers
          if ((source as any).doi || (source as any).url) {
            const { extractPDFText } = await import('../../providers/pdf-extractor');
            const pdfUrl = (source as any).url || ((source as any).doi ? `https://doi.org/${(source as any).doi}` : null);
            if (pdfUrl) {
              const result = await extractPDFText(pdfUrl, { maxPages: 20, timeout: 30000 });
              if (result.success && result.text && result.text.length > 500) {
                (source as any).fullText = result.text;
                (source as any).abstract = (source as any).abstract || result.text.slice(0, 500);
                deepenedCount++;
              }
            }
          }
        } catch (e) {
          // Non-blocking: continue with other sources
        }
      }
      if (deepenedCount > 0) {
        console.log(`${label} DEEPEN: extracted full-text for ${deepenedCount}/${sourcesNeedingFullText.length} sources`);
        // Re-run reader on deepened sources (durable: full re-read)
        const { readerAgentV3 } = await import('../reader-agent-v3');
        const deepenedReadings = await durable('reader:deepen', () => readerAgentV3(topSources));
        // Merge: keep the better reading per source
        for (const dr of deepenedReadings) {
          const idx = readings.findIndex((r: any) => r.sourceId === dr.sourceId);
          if (idx < 0 || (dr.claims?.length > (readings[idx]?.claims?.length || 0))) {
            if (idx >= 0) readings[idx] = dr;
          }
        }
        orchState.sourcesWithFullText = readings.filter((r: any) => r.readingDepth === "full_text").length;
        stats.orchestrator.deepenTriggered = true;
        stats.orchestrator.deepenedCount = deepenedCount;
      }
      orchState.iteration++;
      emitProgress(pipelineRunId, "READER", "completed", `Deepened ${deepenedCount} sources`);
    } catch (err) {
      console.warn(`${label} DEEPEN: failed (non-blocking):`, err);
    }
  }

  // ── STEP 5b-2: HYPOTHESIS JUDGE — verdict per pre-registered hypothesis ──
  let hypothesisVerdictBlock = '';
  let boundThesis: import('../hypothesis-engine').HypothesisVerdict | undefined;
  if (framing.hypotheses.length > 0) {
    try {
      const { hypothesisJudge } = await import('../hypothesis-engine');
      const judge = await hypothesisJudge(framing.hypotheses, topSources, readings, quant.evidenceBlock || undefined);
      addCost(judge.costUsd, 'HYPOTHESIS JUDGE');
      hypothesisVerdictBlock = judge.verdictBlock;
      boundThesis = judge.boundThesis;
      stats.hypothesisJudge = {
        verdicts: judge.verdicts.map(v => ({ id: v.id, verdict: v.verdict, confidence: v.confidence })),
        costUsd: judge.costUsd,
      };
      // Source-first thesis contract: the central claim is chosen FROM the
      // corpus (best-supported hypothesis), not asserted before evidence.
      // Downstream (post-analyst) verifies the written verdict stays inside it.
      if (boundThesis) {
        stats.thesisBinding = {
          id: boundThesis.id,
          statement: boundThesis.statement,
          verdict: boundThesis.verdict,
          confidence: boundThesis.confidence,
          supportingSources: boundThesis.supportingEvidence.length,
        };
      }
    } catch (err) {
      console.warn(`${label} HYPOTHESIS JUDGE: failed (non-blocking):`, err);
    }
  }

  // DPP SYNTHESIS (V3.1)
  let dppContextBlock: string | null = null;
  try {
    if (readings.length > 8) {
      const { extractAtomicKeyPoints, selectDiverseKeyPoints, formatKeyPointsForAnalyst } = await import("../dpp-synthesis");
      const keyPoints = await extractAtomicKeyPoints(readings.map((r: any, i: number) => ({ sourceId: r.sourceId, sourceIndex: i, claims: r.claims || [], methods: r.methods || [], results: r.results || [], limitations: r.limitations || [], title: topSources[i]?.title, abstract: topSources[i]?.abstract || undefined })));
      const selection = selectDiverseKeyPoints(keyPoints, 20, 0.5);
      dppContextBlock = formatKeyPointsForAnalyst(selection);
      if (dppContextBlock) { console.log(`${label} DPP SYNTHESIS: ${selection.selectedPoints.length}/${keyPoints.length} points (diversity=${Math.round(selection.diversityScore * 100)}%)`); stats.dppSynthesis = { totalPoints: keyPoints.length, selectedPoints: selection.selectedPoints.length, diversityScore: selection.diversityScore, coverageScore: selection.coverageScore } as any; }
    }
  } catch (err) { console.warn(`${label} DPP SYNTHESIS: failed (non-blocking):`, err); }

  // ADAPTIVE RAG (V3.1)
  try {
    const { assessRetrievalSufficiency } = await import("../adaptive-rag");
    const assessment = await assessRetrievalSufficiency({ researchQuestion: query, sources: topSources.map((s: any) => ({ title: s.title, abstract: s.abstract || "", provider: s.provider, year: s.year })), readings: readings.map((r: any) => ({ sourceId: r.sourceId, claims: r.claims, confidence: r.confidence })) });
    stats.adaptiveRag = { sufficient: assessment.sufficient, confidence: assessment.confidence, gaps: assessment.gaps } as any;
    if (!assessment.sufficient) console.log(`${label} ADAPTIVE RAG: insufficient (${assessment.confidence}%): ${assessment.gaps.join("; ")}`);
    else console.log(`${label} ADAPTIVE RAG: sufficient (${assessment.confidence}%)`);
  } catch (err) { console.warn(`${label} ADAPTIVE RAG: failed (non-blocking):`, err); }

  // ROUND-TABLE DELIBERATION (V3.1) for controversial topics
  let roundTableBlock: string | null = null;
  if (isStrategic && runDeliberationStep) {
    try {
      const isControversial = ((primedContext?.activeControversies?.length ?? 0) > 0) || (readings.some((r: any) => r.claimClassifications?.some((c: any) => c.type === "controversial")));
      if (isControversial) {
        const { deliberate } = await import("../round-table");
        const dr = await deliberate(query, topSources.slice(0, 5).map((s: any) => ({ title: s.title, abstract: s.abstract || "" })), { rounds: 2, participants: 3 });
        stats.roundTable = { consensus: dr.consensus, participants: dr.participants.length, rounds: dr.rounds.length } as any;
        console.log(`${label} ROUND-TABLE: consensus=${dr.consensus}, ${dr.participants.length}p, ${dr.rounds.length}r`);
        if (dr.synthesis) roundTableBlock = `## ROUND-TABLE DELIBERATION\nConsensus: ${dr.consensus.toUpperCase()}\n\n${dr.synthesis}`;
      }
    } catch (err) { console.warn(`${label} ROUND-TABLE: failed (non-blocking):`, err); }
  }

  return {
    readings, framing, quant, quantBridge, readerMemoryBlock,
    evidenceBankBlock, evidenceBankRef, hypothesisVerdictBlock,
    dppContextBlock, roundTableBlock,
  };
}
