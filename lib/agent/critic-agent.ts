/**
 * NomosX Critic Agent — Multi-stage verification with adversarial scrutiny.
 *
 * Inspired by:
 * - Critic-Guided Hybrid Agentic RAG (OpenReview 2026): multi-stage verification
 *   with atomic claim verification + adaptive retrieval + semantic failure memory
 * - GAVEL (ACL 2026): Evidence-Contract Debate with mechanized scrutiny
 * - Self-Correcting RAG (ACL 2026): NLI-guided verification + repair
 * - Reflective RAG (ACL 2026): self-evaluation driven strategy optimization
 *
 * The Critic sits between ANALYST and PUBLISHER and performs:
 * 1. CLAIM DECOMPOSITION: Break the analysis into atomic claims
 * 2. EVIDENCE GROUNDING: Verify each claim against its cited source (NLI)
 * 3. CITATION VALIDATION: Check that [SRC-N] tags point to the right source
 * 4. CONTRADICTION DETECTION: Find claims that contradict each other
 * 5. BIAS DETECTION: Check for systematic bias (funder, selection, confirmation)
 * 6. REPAIR: If claims fail verification, suggest specific fixes
 * 7. VERDICT: ACCEPT, REPAIR, or REJECT the analysis
 *
 * The Critic can force the pipeline to retry ANALYST with targeted feedback.
 */

import { callLLM } from '../llm/unified-llm';
import { parseJson } from './json-utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type CriticVerdict = 'accept' | 'repair' | 'reject';

export interface AtomicClaim {
  id: string;
  text: string;
  citationTag?: string; // [SRC-N]
  sourceIndex?: number;
  /** All cited indices for multi-cited claims ([SRC-22][SRC-16][SRC-9] → [22,16,9]).
   *  sourceIndex is the primary; grounding verifies against the union excerpt. */
  sourceIndices?: number[];
  // Epistemic kind — a prospective note's causal-chain claims are warranted
  // inferences, not source-asserted facts. Facts need literal support;
  // inferences/projections need a DERIVABLE premise in the cited source.
  kind?: 'fact' | 'inference' | 'projection';
  verdict: 'supported' | 'partially_supported' | 'derived' | 'unsupported' | 'contradicted' | 'unverifiable';
  evidence?: string;
  reasoning?: string;
  confidence: number; // 0-1
}

export interface ContradictionPair {
  claim1Id: string;
  claim2Id: string;
  claim1Text: string;
  claim2Text: string;
  explanation: string;
  severity: 'minor' | 'moderate' | 'severe';
}

export interface BiasFlag {
  type: 'funder' | 'selection' | 'confirmation' | 'publication' | 'language' | 'temporal';
  description: string;
  affectedClaims: string[];
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface CitationIssue {
  claimId: string;
  tag: string;
  issue: 'missing' | 'invalid' | 'misattributed' | 'vague';
  expectedSource?: string;
  actualSource?: string;
  explanation: string;
}

export interface CriticResult {
  verdict: CriticVerdict;
  claims: AtomicClaim[];
  contradictions: ContradictionPair[];
  biases: BiasFlag[];
  citationIssues: CitationIssue[];
  overallScore: number; // 0-100
  groundedness: number; // 0-1, fraction of supported claims
  repairInstructions?: string;
  repairTargetClaims?: string[]; // IDs of claims that need repair
  costUsd: number;
  durationMs: number;
  stageResults: {
    decomposition: { claimsExtracted: number };
    grounding: { supported: number; derived: number; partial: number; unsupported: number; contradicted: number; unverifiable: number };
    contradictions: { pairsFound: number; severeCount: number };
    bias: { flagsRaised: number; highSeverity: number };
    citations: { issuesFound: number };
  };
}

// ─── Stage 1: Claim Decomposition ───────────────────────────────────────────

const DECOMPOSITION_PROMPT = `You are a fact-checker at a Tier-1 think tank. Your task is to decompose a research analysis into atomic claims.

An atomic claim is a single, self-contained statement. Tag each claim's epistemic kind:

- "fact": a verifiable assertion about present or past reality — data, events, stated positions. Needs literal source support.
- "inference": a conclusion the analysis DRAWS from evidence — causal links, implications, "this means that". Verified by derivability: the cited source must contain the premise.
- "projection": a claim about a projected or conditional future — scenarios, trajectories, "by 2030", "would", "could". Verified by whether a sourced present fact or mechanism grounds it.

For each claim, extract:
- The claim text (decontextualized so it's self-contained)
- The citation tag if present (e.g. [SRC-3])
- The source index (the number in [SRC-N])
- kind: fact | inference | projection

ANALYSIS TO DECOMPOSE:
{analysis}

Return JSON:
{
  "claims": [
    {
      "id": "claim_1",
      "text": "Carbon taxes reduce emissions by 10-20% in European countries",
      "citationTag": "[SRC-3]",
      "sourceIndex": 3,
      "kind": "fact"
    }
  ]
}

Rules:
- Extract ALL verifiable claims — facts AND the analysis's conclusions/inferences/projections (they are the product being graded)
- Decontextualize each claim (it should be understandable without the surrounding text)
- Preserve the citation tag exactly as written
- If a claim has no citation, set citationTag to null and sourceIndex to null
- Aim for 10-30 claims depending on analysis length
- Each claim should be one sentence, verifiable on its own`;

export async function decomposeAnalysis(analysis: string): Promise<{ claims: AtomicClaim[]; costUsd: number }> {
  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: DECOMPOSITION_PROMPT.replace('{analysis}', analysis.slice(0, 12000)),
      }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 4000,
      task: 'reader_v3',
      enableCache: true,
    });

    const result = parseJson<{ claims: Array<{ id: string; text: string; citationTag?: string; sourceIndex?: number; kind?: string }> }>(response.content);

    if (result?.claims && Array.isArray(result.claims)) {
      const claims: AtomicClaim[] = result.claims.map(c => {
        // Deterministic recovery: the LLM often extracts citationTag
        // ("[SRC-7]") but leaves sourceIndex null — parse it instead of
        // letting the claim fall through to "unverifiable" (19/31 observed
        // on a live run, collapsing groundedness to ~39% on real evidence).
        // Multi-cited claims ([SRC-22][SRC-16][SRC-9] — 138 groups observed)
        // carry every index so grounding can verify against the union.
        const allTags = [
          ...(c.citationTag ? [c.citationTag] : []),
          ...(c.text.match(/\[(?:SRC|E)-?\d+\]/g) ?? []),
        ];
        const sourceIndices = [...new Set(
          allTags.map(t => parseInt(t.match(/\d+/)![0], 10)).filter(Number.isFinite),
        )];
        const sourceIndex = c.sourceIndex ?? sourceIndices[0];
        return {
          id: c.id,
          text: c.text,
          citationTag: c.citationTag ?? allTags[0],
          sourceIndex,
          sourceIndices: sourceIndices.length > 1 ? sourceIndices : undefined,
          kind: c.kind === 'inference' || c.kind === 'projection' ? c.kind : 'fact',
          verdict: 'unverifiable',
          confidence: 0,
        };
      });
      return { claims, costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0 };
    }
  } catch (err) {
    console.warn('[Critic] Decomposition failed:', String(err).slice(0, 100));
  }

  // Fallback: simple sentence splitting
  const sentences = analysis.match(/[^.!?]+[.!?]+/g) || [];
  const claims: AtomicClaim[] = sentences.slice(0, 20).map((s, i) => {
    const citationMatch = s.match(/\[SRC-(\d+)\]/);
    return {
      id: `claim_${i + 1}`,
      text: s.trim(),
      citationTag: citationMatch ? citationMatch[0] : undefined,
      sourceIndex: citationMatch ? parseInt(citationMatch[1], 10) : undefined,
      verdict: 'unverifiable',
      confidence: 0,
    };
  });

  return { claims, costUsd: 0 };
}

// ─── Stage 2: Evidence Grounding (NLI-based) ────────────────────────────────

const GROUNDING_PROMPT = `You are a fact-checker verifying claims against source evidence.

Sources may come from diverse origin types: academic papers, intelligence reports, NGO investigations, think-tank analyses, international organization publications, science/tech organizations, AI lab research, and news articles. Adapt your verification standard to the source type:
- Academic: expect rigorous methodology, peer review, statistical evidence
- Intelligence: expect classified/declassified sources, confidence assessments, may lack transparent methodology
- NGO: expect field investigations, witness accounts, satellite imagery, documented evidence
- Think-tank: expect policy analysis, may be advocacy-oriented, check for ideological framing
- International org: expect official statistics, multilateral consensus, diplomatic language
- Science org: expect experimental data, technical reports, may be pre-publication
- AI lab: expect benchmarks, model evaluations, may overstate capabilities
- News: expect reported facts, named sources, may lack verification

Each claim carries a "kind" that sets the verification standard:

- kind=fact → "supported" requires the source literally states the datum.
- kind=inference → the source need NOT state the conclusion. Verdict "derived" if the source contains the evidentiary premise from which the conclusion follows (the data, mechanism, or finding the analysis builds on). "unsupported" if the source does not even provide that premise.
- kind=projection → "derived" if a sourced present fact or mechanism grounds the projection; "unsupported" if the premise is absent; "unverifiable" if the claim is pure speculation with no citation.

For each claim, determine if it is:
- "supported": The source clearly supports this claim (facts only)
- "partially_supported": The source partially supports the claim (some aspects confirmed, others not addressed)
- "derived": The claim is an inference/projection and the source provides its evidentiary premise
- "unsupported": The source does not support this claim (but doesn't contradict it)
- "contradicted": The source directly contradicts this claim
- "unverifiable": The claim cannot be verified from the cited source (e.g. no citation, or source doesn't address this topic)

CLAIMS TO VERIFY:
{claims}

SOURCES (key excerpts):
{sources}

Return JSON:
{
  "results": [
    {
      "id": "claim_1",
      "verdict": "supported",
      "evidence": "The source states: '...'",
      "reasoning": "The claim directly follows from the source statement",
      "confidence": 0.95
    }
  ]
}`;

/**
 * Extract claim-relevant excerpts from a source's full text.
 * The reader extracts up to 400k chars per PDF — we can't send all of it to
 * the grounding LLM. Instead we score each full-text sentence by lexical
 * overlap with the claims being verified and keep the top ones.
 * This fixes the groundedness collapse: claims written from page 40 of a PDF
 * were judged "unsupported" because the critic only saw the abstract.
 */
function lexicalRankSentences(
  sentences: string[],
  claims: AtomicClaim[],
): Array<{ s: string; i: number; score: number }> {
  const claimTerms = new Set<string>();
  for (const c of claims) {
    for (const w of c.text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)) {
      if (w.length > 3) claimTerms.add(w);
    }
  }
  return sentences.map((s, i) => {
    const words = new Set(s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/));
    let hits = 0;
    for (const t of claimTerms) if (words.has(t)) hits++;
    return { s, i, score: hits };
  });
}

/**
 * Claim-relevant excerpt from a source (abstract + full text).
 * Semantic retrieval when the embedder is live (OpenResearcher-style local
 * retrieval over extracted text) — lexical overlap as deterministic fallback.
 */
async function buildSourceExcerpt(
  abstract: string,
  fullText: string | undefined,
  claims: AtomicClaim[],
  maxChars = 3500,
): Promise<string> {
  if (!fullText || fullText.length < 200) return abstract;
  const sentences = fullText
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 600);

  let top: Array<{ s: string; i: number }> = [];
  let semanticUsed = false;
  try {
    const { embedBatchDetailed, cosineSimilarity } = await import('./semantic-engine');
    // Lexical prefilter bounds the embed batch on long extracts.
    const candidates = sentences.length > 80
      ? lexicalRankSentences(sentences, claims).filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score).slice(0, 80)
      : sentences.map((s, i) => ({ s, i }));
    if (candidates.length > 0) {
      const texts = [...claims.map(c => c.text), ...candidates.map(c => c.s)];
      const { embeddings, model } = await embedBatchDetailed(texts);
      if (model !== 'none') {
        const claimEmbs = embeddings.slice(0, claims.length);
        const sentEmbs = embeddings.slice(claims.length);
        top = sentEmbs
          .map((e, i) => ({ s: candidates[i].s, i: candidates[i].i,
            score: Math.max(...claimEmbs.map(ce => cosineSimilarity(e, ce))) }))
          .filter(x => x.score > 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 18)
          .sort((a, b) => a.i - b.i);
        semanticUsed = top.length > 0;
      }
    }
  } catch { /* embedder down → lexical */ }

  if (!semanticUsed) {
    top = lexicalRankSentences(sentences, claims)
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .sort((a, b) => a.i - b.i);
  }

  const excerpt = top.map(x => x.s).join(' ').slice(0, maxChars);
  // Abstract first (orientation), then the evidence-bearing excerpt
  return excerpt.length > 200
    ? `${abstract}\n\n--- FULL-TEXT EXCERPTS ---\n${excerpt}`
    : abstract;
}

export async function groundClaims(
  claims: AtomicClaim[],
  sources: Array<{ index: number; title: string; abstract: string; fullText?: string | null }>,
): Promise<{ claims: AtomicClaim[]; costUsd: number }> {
  // Group claims by source for efficiency
  const claimsBySource = new Map<number, AtomicClaim[]>();
  for (const claim of claims) {
    if (claim.sourceIndex !== undefined && claim.sourceIndex !== null) {
      const idx = claim.sourceIndex;
      if (!claimsBySource.has(idx)) claimsBySource.set(idx, []);
      claimsBySource.get(idx)!.push(claim);
    }
  }

  const updatedClaims = [...claims];
  let totalCost = 0;

  // Verify claims in batches by source
  for (const [sourceIdx, sourceClaims] of claimsBySource) {
    const source = sources.find(s => s.index === sourceIdx);
    if (!source) {
      // Source not found — mark as unverifiable
      for (const claim of sourceClaims) {
        const idx = updatedClaims.findIndex(c => c.id === claim.id);
        if (idx >= 0) {
          updatedClaims[idx] = { ...updatedClaims[idx], verdict: 'unverifiable', confidence: 0.3, reasoning: 'Cited source not found in source pool' };
        }
      }
      continue;
    }

    const claimsJson = JSON.stringify(sourceClaims.map(c => ({ id: c.id, text: c.text, kind: c.kind ?? 'fact' })));
    const evidence = await buildSourceExcerpt(
      (source.abstract || '').slice(0, 1200),
      source.fullText || undefined,
      sourceClaims,
    );
    const sourceEntries: Array<{ index: number; title: string; abstract: string }> = [
      { index: sourceIdx, title: source.title, abstract: evidence },
    ];
    // Multi-cited claims ([SRC-22][SRC-16][SRC-9]) — attach the OTHER cited
    // sources' excerpts so a claim spread across sources isn't judged
    // "unverifiable" against only the primary one.
    const extraIdx = new Set<number>();
    for (const c of sourceClaims) {
      for (const ix of c.sourceIndices ?? []) {
        if (ix !== sourceIdx) extraIdx.add(ix);
      }
    }
    for (const ix of [...extraIdx].slice(0, 3)) {
      const alt = sources.find(s => s.index === ix);
      if (!alt) continue;
      const altClaims = sourceClaims.filter(c => c.sourceIndices?.includes(ix));
      sourceEntries.push({
        index: ix,
        title: alt.title,
        abstract: await buildSourceExcerpt((alt.abstract || '').slice(0, 800), alt.fullText || undefined, altClaims, 1500),
      });
    }
    const sourcesJson = JSON.stringify(sourceEntries);

    try {
      const response = await callLLM({
        messages: [{
          role: 'user',
          content: GROUNDING_PROMPT
            .replace('{claims}', claimsJson)
            .replace('{sources}', sourcesJson),
        }],
        temperature: 0.1,
        jsonMode: true,
        maxTokens: 2000,
        task: 'reader_v3',
        enableCache: true,
      });

      totalCost += typeof response.costUsd === 'number' ? response.costUsd : 0;

      const result = parseJson<{ results: Array<{ id: string; verdict: string; evidence?: string; reasoning?: string; confidence: number }> }>(response.content);

      if (result?.results) {
        for (const r of result.results) {
          const idx = updatedClaims.findIndex(c => c.id === r.id);
          if (idx >= 0) {
            updatedClaims[idx] = {
              ...updatedClaims[idx],
              verdict: r.verdict as AtomicClaim['verdict'],
              evidence: r.evidence,
              reasoning: r.reasoning,
              confidence: r.confidence,
            };
          }
        }
      }
    } catch (err) {
      console.warn(`[Critic] Grounding failed for source ${sourceIdx}:`, String(err).slice(0, 80));
    }
  }

  // ── Cross-source rescue (ALCE/RAGTruth pattern) ──
  // A claim citing [SRC-5] may actually be supported by [SRC-12] — a wrong
  // citation is not missing evidence. For each unsupported claim, find the
  // corpus source whose text has the highest lexical overlap and re-verify
  // against it in batched calls. Prioritize claims that DO carry a citation
  // (wrong-source misses) over uncited ones; cap total rescue work at 16
  // claims in 2 batches — the old `length <= 12` gate silently disabled all
  // rescue precisely when grounding went badly (>12 failures → zero rescue).
  const unsupported = updatedClaims.filter(c => c.verdict === 'unsupported' || c.verdict === 'unverifiable');
  if (unsupported.length > 0) {
    try {
      const prioritized = [...unsupported].sort((a, b) =>
        (b.sourceIndex != null ? 1 : 0) - (a.sourceIndex != null ? 1 : 0));
      const rescueCandidates: Array<{ claim: AtomicClaim; altIdx: number; excerpt: string }> = [];
      for (const claim of prioritized.slice(0, 16)) {
        const claimWords = new Set(claim.text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w: string) => w.length > 3));
        let bestIdx = -1; let bestScore = 0;
        for (const s of sources) {
          if (s.index === claim.sourceIndex) continue; // already failed against this one
          const corpus = `${s.title || ''} ${s.abstract || ''} ${(s.fullText || '').slice(0, 8000)}`.toLowerCase();
          const words = new Set(corpus.replace(/[^\w\s]/g, ' ').split(/\s+/));
          let hits = 0;
          for (const w of claimWords) if (words.has(w)) hits++;
          const score = claimWords.size > 0 ? hits / claimWords.size : 0;
          if (score > bestScore) { bestScore = score; bestIdx = s.index; }
        }
        if (bestIdx >= 0 && bestScore >= 0.35) {
          const alt = sources.find(s => s.index === bestIdx)!;
          rescueCandidates.push({
            claim,
            altIdx: bestIdx,
            excerpt: await buildSourceExcerpt((alt.abstract || '').slice(0, 800), alt.fullText || undefined, [claim], 2000),
          });
        }
      }
      let rescued = 0;
      // Batch in groups of 8 — a single 2000-token response truncates on
      // larger sets, silently dropping verdicts.
      for (let off = 0; off < rescueCandidates.length; off += 8) {
        const batch = rescueCandidates.slice(off, off + 8);
        const rescueJson = batch.map(r => ({
          claimId: r.claim.id,
          claimText: r.claim.text,
          sourceIndex: r.altIdx,
          excerpt: r.excerpt,
        }));
        const rescueRes = await callLLM({
          messages: [{
            role: 'user',
            content: `You are a fact-checker. For each claim below, an alternative source excerpt is provided (the claim's original citation pointed elsewhere — this is a re-verification against the BEST-matching source in the corpus). Judge whether THIS excerpt supports the claim.\n\nReturn JSON: { "results": [{ "claimId": "...", "verdict": "supported|partially_supported|unsupported|contradicted", "confidence": 0.0-1.0, "evidence": "..." }] }\n\n${JSON.stringify(rescueJson)}`,
          }],
          temperature: 0.1,
          jsonMode: true,
          maxTokens: 2000,
          task: 'reader_v3',
          enableCache: true,
        });
        totalCost += typeof rescueRes.costUsd === 'number' ? rescueRes.costUsd : 0;
        const rescueParsed = parseJson<{ results: Array<{ claimId: string; verdict: string; confidence: number; evidence?: string }> }>(rescueRes.content);
        if (rescueParsed?.results) {
          for (const r of rescueParsed.results) {
            const idx = updatedClaims.findIndex(c => c.id === r.claimId);
            if (idx >= 0 && (r.verdict === 'supported' || r.verdict === 'partially_supported')) {
              updatedClaims[idx] = {
                ...updatedClaims[idx],
                verdict: r.verdict as AtomicClaim['verdict'],
                confidence: r.confidence,
                reasoning: `Cross-source rescue (alt source): ${r.evidence || r.verdict}`,
              };
              rescued++;
            }
          }
        }
      }
      if (rescued > 0) console.log(`[Critic] Cross-source rescue: ${rescued}/${rescueCandidates.length} claims re-verified against alternate sources`);
    } catch (err) {
      console.warn('[Critic] Cross-source rescue failed (non-blocking):', String(err).slice(0, 80));
    }
  }

  // Mark claims without citations as unverifiable
  for (let i = 0; i < updatedClaims.length; i++) {
    if (updatedClaims[i].sourceIndex === undefined || updatedClaims[i].sourceIndex === null) {
      updatedClaims[i] = { ...updatedClaims[i], verdict: 'unverifiable', confidence: 0.2, reasoning: 'No citation provided' };
    }
  }

  return { claims: updatedClaims, costUsd: totalCost };
}

// ─── Stage 3: Contradiction Detection ───────────────────────────────────────

const CONTRADICTION_PROMPT = `You are a logical consistency checker. Identify contradictions between claims in a research analysis.

Two claims contradict each other if they assert mutually exclusive things.

CLAIMS:
{claims}

Return JSON:
{
  "contradictions": [
    {
      "claim1Id": "claim_3",
      "claim2Id": "claim_7",
      "claim1Text": "...",
      "claim2Text": "...",
      "explanation": "Claim 3 says X increased while claim 7 says X decreased",
      "severity": "severe"
    }
  ]
}

Rules:
- Only report genuine contradictions (not just different perspectives)
- severity: "minor" (nuance difference), "moderate" (factual disagreement), "severe" (direct contradiction)
- If no contradictions, return empty array

CRITICAL — temporal scope: a claim about the PRESENT state and a claim about a PROJECTED future are NOT contradictions. "Petrostates depend on oil today" and "petrostates may be diversified economies by 2040" describe a trajectory — the entire point of prospective analysis. Only flag claims that conflict within the SAME temporal scope (both present-fact, or the same horizon).`

export async function detectContradictions(claims: AtomicClaim[]): Promise<{ contradictions: ContradictionPair[]; costUsd: number }> {
  if (claims.length < 2) return { contradictions: [], costUsd: 0 };

  try {
    const claimsJson = JSON.stringify(claims.map(c => ({ id: c.id, text: c.text })));
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: CONTRADICTION_PROMPT.replace('{claims}', claimsJson),
      }],
      temperature: 0.1,
      jsonMode: true,
      maxTokens: 2000,
      task: 'reader_v3',
      enableCache: true,
    });

    const result = parseJson<{ contradictions: ContradictionPair[] }>(response.content);
    if (result?.contradictions && Array.isArray(result.contradictions)) {
      return { contradictions: result.contradictions, costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0 };
    }
  } catch (err) {
    console.warn('[Critic] Contradiction detection failed:', String(err).slice(0, 80));
  }

  return { contradictions: [], costUsd: 0 };
}

// ─── Stage 4: Bias Detection ────────────────────────────────────────────────

const BIAS_PROMPT = `You are a bias auditor for a think tank. Identify systematic biases in a research analysis.

Check for:
1. "funder": Claims align with funder interests
2. "selection": Cherry-picked evidence (only supportive sources cited)
3. "confirmation": Interprets ambiguous evidence as supporting the thesis
4. "publication": Only published peer-reviewed work cited (missing grey literature)
5. "language": Only English-language sources (missing non-English perspectives)
6. "temporal": Only recent sources (missing historical context) or only old sources
7. "institutional": Sources dominated by one institutional perspective (e.g., only intelligence agencies, only NGOs, only Western think tanks)
8. "threat_inflation": Intelligence sources may overstate threats or risks (classification bias — only declassified info is visible)
9. "advocacy": NGO sources may frame evidence to support advocacy goals (highlighting violations, downplaying context)
10. "ideological": Think-tank sources may reflect political orientations (conservative/libertarian/progressive/centrist)
11. "diplomatic": International org sources may use consensus-seeking language, downplay conflicts between member states
12. "commercial": AI lab/industry sources may overstate capabilities, understate risks (commercial interest)
13. "source_homogeneity": Analysis relies on only one TYPE of source (e.g., all academic, all news) without cross-corroboration from other source types

CLAIMS:
{claims}

SOURCES:
{sources}

CRITICAL — genre calibration: this is a POSITION paper. The analysis taking a stance and arguing for it is the product, not a bias. Do NOT flag "confirmation" bias merely because claims are consistent with the thesis — flag it only if the analysis ignores corpus evidence that contradicts its claims, or systematically cites only supporting sources when contrarian sources exist in the pool. A projection about the future is not "temporal bias" — only flag temporal if the SOURCE selection is skewed (all old OR all recent when history matters).

Return JSON:
{
  "biases": [
    {
      "type": "selection",
      "description": "All cited sources support the thesis; no contrarian evidence included",
      "affectedClaims": ["claim_1", "claim_5"],
      "severity": "high",
      "mitigation": "Add at least 2 sources that challenge the main thesis"
    }
  ]
}`;

export async function detectBias(
  claims: AtomicClaim[],
  sources: Array<{ index: number; title: string; provider: string; year?: number }>,
): Promise<{ biases: BiasFlag[]; costUsd: number }> {
  try {
    const claimsJson = JSON.stringify(claims.slice(0, 20).map(c => ({ id: c.id, text: c.text, verdict: c.verdict })));
    const sourcesJson = JSON.stringify(sources.slice(0, 20).map(s => ({ index: s.index, title: s.title, provider: s.provider, year: s.year })));

    const response = await callLLM({
      messages: [{
        role: 'user',
        content: BIAS_PROMPT
          .replace('{claims}', claimsJson)
          .replace('{sources}', sourcesJson),
      }],
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 2000,
      task: 'reader_v3',
      enableCache: true,
    });

    const result = parseJson<{ biases: BiasFlag[] }>(response.content);
    if (result?.biases && Array.isArray(result.biases)) {
      return { biases: result.biases, costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0 };
    }
  } catch (err) {
    console.warn('[Critic] Bias detection failed:', String(err).slice(0, 80));
  }

  return { biases: [], costUsd: 0 };
}

// ─── Stage 5: Citation Validation ───────────────────────────────────────────

export function validateCitations(
  claims: AtomicClaim[],
  sourceCount: number,
): CitationIssue[] {
  const issues: CitationIssue[] = [];

  for (const claim of claims) {
    if (!claim.citationTag) {
      // A claim marked unverifiable BECAUSE it has no citation is exactly the
      // case to flag — don't skip it, that's where the defect lives.
      if (/\d+%|\$\d|\d{4}|\d{3,}/.test(claim.text) || claim.verdict === 'unverifiable') {
        issues.push({
          claimId: claim.id,
          tag: 'none',
          issue: 'missing',
          explanation: claim.verdict === 'unverifiable'
            ? 'Claim carries no citation — cannot be verified'
            : 'Factual claim with numbers/statistics has no citation',
        });
      }
      continue;
    }

    const match = claim.citationTag.match(/SRC-(\d+)/);
    if (!match) {
      issues.push({
        claimId: claim.id,
        tag: claim.citationTag,
        issue: 'invalid',
        explanation: `Malformed citation tag: ${claim.citationTag}`,
      });
      continue;
    }

    const n = parseInt(match[1], 10);
    if (n < 1 || n > sourceCount) {
      issues.push({
        claimId: claim.id,
        tag: claim.citationTag,
        issue: 'invalid',
        explanation: `Citation [SRC-${n}] out of range (1-${sourceCount})`,
      });
    }
  }

  return issues;
}

// ─── Stage 6: Repair Instructions ───────────────────────────────────────────

const REPAIR_PROMPT = `You are a research editor. The Critic agent has found issues with a research analysis. Generate specific repair instructions.

ISSUES FOUND:
- Unsupported claims: {unsupportedCount}
- Contradicted claims: {contradictedCount}
- Contradictions: {contradictionCount}
- Bias flags: {biasCount}
- Citation issues: {citationIssueCount}

DETAILS:
{details}

Generate repair instructions that the ANALYST agent can follow to fix the analysis:

Return JSON:
{
  "repairInstructions": "Specific, actionable instructions for the analyst to fix the issues. Include which claims to revise, what evidence to add, and how to address biases.",
  "repairTargetClaims": ["claim_3", "claim_7"]
}`;

export async function generateRepairInstructions(
  unsupportedCount: number,
  contradictedCount: number,
  contradictionCount: number,
  biasCount: number,
  citationIssueCount: number,
  details: string,
): Promise<{ repairInstructions?: string; repairTargetClaims?: string[]; costUsd: number }> {
  try {
    const response = await callLLM({
      messages: [{
        role: 'user',
        content: REPAIR_PROMPT
          .replace('{unsupportedCount}', String(unsupportedCount))
          .replace('{contradictedCount}', String(contradictedCount))
          .replace('{contradictionCount}', String(contradictionCount))
          .replace('{biasCount}', String(biasCount))
          .replace('{citationIssueCount}', String(citationIssueCount))
          .replace('{details}', details.slice(0, 3000)),
      }],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: 1500,
      task: 'reader_v3',
      enableCache: true,
    });

    const result = parseJson<{ repairInstructions: string; repairTargetClaims: string[] }>(response.content);
    if (result?.repairInstructions) {
      return {
        repairInstructions: result.repairInstructions,
        repairTargetClaims: result.repairTargetClaims,
        costUsd: typeof response.costUsd === 'number' ? response.costUsd : 0,
      };
    }
  } catch (err) {
    console.warn('[Critic] Repair generation failed:', String(err).slice(0, 80));
  }

  return { costUsd: 0 };
}

// ─── Main: Run Full Critic Pipeline ─────────────────────────────────────────

/**
 * Run the full Critic agent pipeline on an analysis.
 *
 * @param analysisText - The full analysis text (or JSON stringified)
 * @param sources - The sources used in the analysis
 * @param options - Configuration options
 * @returns CriticResult with verdict, claims, issues, and repair instructions
 */
export async function runCritic(
  analysisText: string,
  sources: Array<{ index: number; title: string; abstract: string; provider: string; year?: number; fullText?: string | null }>,
  options?: { skipBias?: boolean; skipContradictions?: boolean },
): Promise<CriticResult> {
  const startTime = Date.now();
  let totalCost = 0;

  // Stage 1: Decompose analysis into atomic claims
  console.log('[Critic] Stage 1: Decomposing analysis into atomic claims...');
  const { claims, costUsd: decomposeCost } = await decomposeAnalysis(analysisText);
  totalCost += decomposeCost;
  console.log(`[Critic] Decomposed into ${claims.length} atomic claims`);

  // Stage 2: Ground claims against sources (NLI-based)
  console.log('[Critic] Stage 2: Grounding claims against sources...');
  const { claims: groundedClaims, costUsd: groundingCost } = await groundClaims(claims, sources);
  totalCost += groundingCost;

  const groundingStats = {
    supported: groundedClaims.filter(c => c.verdict === 'supported').length,
    partial: groundedClaims.filter(c => c.verdict === 'partially_supported').length,
    derived: groundedClaims.filter(c => c.verdict === 'derived').length,
    unsupported: groundedClaims.filter(c => c.verdict === 'unsupported').length,
    contradicted: groundedClaims.filter(c => c.verdict === 'contradicted').length,
    unverifiable: groundedClaims.filter(c => c.verdict === 'unverifiable').length,
  };
  console.log(`[Critic] Grounding: ${groundingStats.supported} supported, ${groundingStats.derived} derived, ${groundingStats.partial} partial, ${groundingStats.unsupported} unsupported, ${groundingStats.contradicted} contradicted, ${groundingStats.unverifiable} unverifiable`);

  // Stage 3: Detect contradictions
  let contradictions: ContradictionPair[] = [];
  if (!options?.skipContradictions && groundedClaims.length > 1) {
    console.log('[Critic] Stage 3: Detecting contradictions...');
    const { contradictions: conts, costUsd: contCost } = await detectContradictions(groundedClaims);
    contradictions = conts;
    totalCost += contCost;
    console.log(`[Critic] Found ${contradictions.length} contradictions (${contradictions.filter(c => c.severity === 'severe').length} severe)`);
  }

  // Stage 4: Detect bias
  let biases: BiasFlag[] = [];
  if (!options?.skipBias) {
    console.log('[Critic] Stage 4: Detecting bias...');
    const { biases: bs, costUsd: biasCost } = await detectBias(groundedClaims, sources);
    biases = bs;
    totalCost += biasCost;
    console.log(`[Critic] Found ${biases.length} bias flags (${biases.filter(b => b.severity === 'high').length} high severity)`);
  }

  // Stage 5: Validate citations
  console.log('[Critic] Stage 5: Validating citations...');
  const citationIssues = validateCitations(groundedClaims, sources.length);
  console.log(`[Critic] Found ${citationIssues.length} citation issues`);

  // Stage 5b: Source authority check — penalize claims relying solely on preprints
  // NomosX: Reduced penalty (1.5 instead of 3) — preprints are where cutting-edge research appears first.
  // Capping confidence at 0.65 instead of 0.5 — a well-grounded preprint claim should not be treated as unreliable.
  const preprintProviders = new Set(['arxiv', 'biorxiv', 'ssrn', 'openreview', 'preprints', 'hal']);
  const preprintDoiPattern = /preprints\.org|arxiv\.org|biorxiv\.org|10\.1101\/|10\.48550\/|preprints-/i;
  let preprintOnlyClaims = 0;
  for (const claim of groundedClaims) {
    if (claim.verdict === 'supported' || claim.verdict === 'partially_supported' || claim.verdict === 'derived') {
      const source = sources.find(s => s.index === claim.sourceIndex);
      if (source) {
        const isPreprint = preprintProviders.has(source.provider?.toLowerCase() || '') ||
          preprintDoiPattern.test(source.title || '') ||
          preprintDoiPattern.test(source.abstract || '');
        if (isPreprint) {
          // Check if this claim has any non-preprint source supporting it
          const hasPeerReviewedSupport = groundedClaims.some(c =>
            c.id !== claim.id && c.text === claim.text &&
            (c.verdict === 'supported' || c.verdict === 'partially_supported' || c.verdict === 'derived') &&
            !preprintProviders.has(sources.find(s => s.index === c.sourceIndex)?.provider?.toLowerCase() || '')
          );
          if (!hasPeerReviewedSupport) {
            preprintOnlyClaims++;
            // Downgrade confidence for preprint-only claims (NomosX: 0.65 instead of 0.5)
            claim.confidence = Math.min(claim.confidence, 0.65);
          }
        }
      }
    }
  }
  // NomosX: Reduced from 3 to 1.5 per claim — preprints are valuable for innovation
  const preprintPenalty = preprintOnlyClaims * 1.5;
  if (preprintOnlyClaims > 0) {
    console.log(`[Critic] Source authority: ${preprintOnlyClaims} claims rely solely on preprints (penalty: -${preprintPenalty})`);
  }

  // NomosX: Novelty bonus — reward claims that are well-supported AND innovative.
  // A claim that challenges consensus but is grounded in evidence should be REWARDED, not penalized.
  const noveltyKeywords = ['novel', 'first', 'unprecedented', 'challenge', 'contrary', 'reconsider', 'paradigm', 'breakthrough', 'emerging', 'new evidence'];
  let noveltyClaimCount = 0;
  for (const claim of groundedClaims) {
    if (claim.verdict === 'supported' || claim.verdict === 'partially_supported' || claim.verdict === 'derived') {
      const claimText = claim.text.toLowerCase();
      if (noveltyKeywords.some(kw => claimText.includes(kw))) {
        noveltyClaimCount++;
      }
    }
  }
  const noveltyBonus = Math.min(noveltyClaimCount * 2, 10); // +2 per novel claim, max +10
  if (noveltyClaimCount > 0) {
    console.log(`[Critic] Novelty bonus: ${noveltyClaimCount} innovative claims grounded in evidence (bonus: +${noveltyBonus})`);
  }

  // Compute overall score
  const totalClaims = groundedClaims.length;
  // 'derived' counts as grounded: an inference/projection is verified by the
  // presence of its evidentiary premise in the cited source, not by the
  // source literally asserting the conclusion.
  const supportedCount = groundingStats.supported + groundingStats.derived + groundingStats.partial * 0.5;
  // Groundedness measures "of the claims we could verify, how many held up".
  // Claims that were never verifiable-by-design — no citation at all — belong
  // to citation coverage (flagged as citationIssues), not grounding. Keeping
  // them in the denominator double-punishes: each uncited claim silently sank
  // groundedness AND escaped the citation-issue ledger (observed: 19/31
  // unverifiable → 39% groundedness on a corpus that actually supported the
  // cited claims). Claims unverifiable for a REAL reason (cited source not
  // found / LLM could not verify) stay in the denominator.
  const uncitedClaims = groundedClaims.filter(c =>
    c.verdict === 'unverifiable' && (c.sourceIndex == null));
  const verifiableTotal = totalClaims - uncitedClaims.length;
  const groundedness = totalClaims > 0 ? supportedCount / Math.max(1, verifiableTotal) : 0;
  if (uncitedClaims.length > 0) {
    console.log(`[Critic] ${uncitedClaims.length}/${totalClaims} claims carry no citation — excluded from groundedness, flagged as citation issues`);
  }
  // NomosX: Reduced severe contradiction penalty from 15→10 — productive disagreements should not be over-penalized
  const contradictionPenalty = contradictions.reduce((sum, c) => sum + (c.severity === 'severe' ? 10 : c.severity === 'moderate' ? 6 : 2), 0);
  // NomosX: Bias penalty is now PROPORTIONAL to the number of claims.
  // Old formula: 6 bias flags × 5pts = -35 points → destroyed the score even with 65% groundedness.
  // New formula: cap bias penalty at 25% of total claims, and reduce per-flag weight.
  // This ensures 6 bias flags on 41 claims (~15%) don't dominate the score.
  const biasPenaltyRaw = biases.reduce((sum, b) => sum + (b.severity === 'high' ? 8 : b.severity === 'medium' ? 4 : 1.5), 0);
  const biasPenaltyCap = Math.max(8, totalClaims * 0.25); // Cap at 25% of claim count
  const biasPenalty = Math.min(biasPenaltyRaw, biasPenaltyCap);
  const citationPenalty = citationIssues.length * 2;
  const overallScore = Math.max(0, Math.min(100, Math.round(groundedness * 100 - contradictionPenalty - biasPenalty - citationPenalty - preprintPenalty + noveltyBonus)));

  // Determine verdict
  let verdict: CriticVerdict;
  if (overallScore >= 75 && contradictions.filter(c => c.severity === 'severe').length === 0 && biases.filter(b => b.severity === 'high').length === 0) {
    verdict = 'accept';
  } else if (overallScore >= 40) {
    verdict = 'repair';
  } else {
    verdict = 'reject';
  }

  // Generate repair instructions if needed
  let repairInstructions: string | undefined;
  let repairTargetClaims: string[] | undefined;
  if (verdict === 'repair' || verdict === 'reject') {
    const details = JSON.stringify({
      unsupportedClaims: groundedClaims.filter(c => c.verdict === 'unsupported').map(c => ({ id: c.id, text: c.text, reasoning: c.reasoning })),
      contradictedClaims: groundedClaims.filter(c => c.verdict === 'contradicted').map(c => ({ id: c.id, text: c.text, evidence: c.evidence })),
      contradictions: contradictions.map(c => ({ claim1: c.claim1Text, claim2: c.claim2Text, explanation: c.explanation })),
      biases: biases.map(b => ({ type: b.type, description: b.description, mitigation: b.mitigation })),
      citationIssues: citationIssues.map(i => ({ claim: i.claimId, issue: i.issue, explanation: i.explanation })),
    }, null, 2);

    const { repairInstructions: instr, repairTargetClaims: targets, costUsd: repairCost } = await generateRepairInstructions(
      groundingStats.unsupported,
      groundingStats.contradicted,
      contradictions.length,
      biases.length,
      citationIssues.length,
      details,
    );
    repairInstructions = instr;
    repairTargetClaims = targets;
    totalCost += repairCost;
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Critic] Verdict: ${verdict} (score=${overallScore}, groundedness=${Math.round(groundedness * 100)}%, ${durationMs}ms, $${totalCost.toFixed(4)})`);

  return {
    verdict,
    claims: groundedClaims,
    contradictions,
    biases,
    citationIssues,
    overallScore,
    groundedness,
    repairInstructions,
    repairTargetClaims,
    costUsd: totalCost,
    durationMs,
    stageResults: {
      decomposition: { claimsExtracted: groundedClaims.length },
      grounding: groundingStats,
      contradictions: { pairsFound: contradictions.length, severeCount: contradictions.filter(c => c.severity === 'severe').length },
      bias: { flagsRaised: biases.length, highSeverity: biases.filter(b => b.severity === 'high').length },
      citations: { issuesFound: citationIssues.length },
    },
  };
}
