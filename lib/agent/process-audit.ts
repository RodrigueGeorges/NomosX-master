/**
 * Process Audit — the PING taxonomy (arXiv 2601.22984) applied to our
 * trajectory. End-to-end evaluation misses hallucinations that originate in
 * intermediate steps. PING splits them into four types; we cover three
 * deterministically (Grounding is already covered by NLI/claim-grounding):
 *
 *   - INTENT: did the planner decompose the actual question, or drift?
 *   - PROPAGATION: did early errors/thin research silently drop sub-questions
 *     that the final analysis then never addresses?
 *   - NOISE: what fraction of the evidence base was retrieved but never used?
 *
 * All checks are deterministic — no LLM calls, no cost.
 */

export interface ProcessAuditResult {
  intent: {
    checked: number;
    /** sub-questions with near-zero lexical overlap with the root question */
    misalignedNodes: string[];
  };
  propagation: {
    checked: number;
    /** successful research nodes whose key terms never appear in the analysis */
    unaddressedNodes: string[];
  };
  noise: {
    totalSources: number;
    citedCount: number;
    /** % of top sources never cited in the final output */
    unusedPct: number;
  };
  /** composite 0-100 — 100 = clean trajectory */
  score: number;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-zàâäéèêëîïôöùûüç0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

export function auditProcessTrace(opts: {
  question: string;
  /** deep-planner nodes (may be empty if flat scout ran) */
  planNodes: Array<{ subQuestion: string; status: string; sourceCount?: number }>;
  analysis: unknown;
  /** [SRC-N] indices actually cited in rendered output */
  citedSourceIndices: number[];
  totalTopSources: number;
}): ProcessAuditResult {
  const questionTokens = tokenize(opts.question);
  const analysisText = (typeof opts.analysis === 'string'
    ? opts.analysis
    : JSON.stringify(opts.analysis ?? {})).toLowerCase();

  // ── INTENT — sub-questions that drifted from the root question ──
  const misalignedNodes: string[] = [];
  for (const node of opts.planNodes) {
    const nodeTokens = tokenize(node.subQuestion);
    // A well-formed sub-question shares at least some vocabulary with the root
    if (jaccard(questionTokens, nodeTokens) < 0.05) {
      misalignedNodes.push(node.subQuestion.slice(0, 80));
    }
  }

  // ── PROPAGATION — researched sub-questions the analysis dropped ──
  const unaddressedNodes: string[] = [];
  for (const node of opts.planNodes) {
    if (node.status !== 'done' && node.status !== 'expanded') continue;
    if ((node.sourceCount ?? 0) < 3) continue;
    // Key terms = content words unique-ish to this node (≥2 hits required)
    const nodeTerms = [...tokenize(node.subQuestion)];
    const hits = nodeTerms.filter(t => analysisText.includes(t)).length;
    if (nodeTerms.length > 0 && hits / nodeTerms.length < 0.15) {
      unaddressedNodes.push(node.subQuestion.slice(0, 80));
    }
  }

  // ── NOISE — sources retrieved but never cited ──
  const citedCount = new Set(opts.citedSourceIndices).size;
  const unusedPct = opts.totalTopSources > 0
    ? Math.round(((opts.totalTopSources - Math.min(citedCount, opts.totalTopSources)) / opts.totalTopSources) * 100)
    : 0;

  // Composite: penalize each failure mode
  const intentPenalty = opts.planNodes.length > 0
    ? (misalignedNodes.length / opts.planNodes.length) * 30 : 0;
  const propPenalty = opts.planNodes.length > 0
    ? (unaddressedNodes.length / opts.planNodes.length) * 40 : 0;
  const noisePenalty = unusedPct > 70 ? 20 : unusedPct > 50 ? 10 : 0;
  const score = Math.max(0, Math.round(100 - intentPenalty - propPenalty - noisePenalty));

  return {
    intent: { checked: opts.planNodes.length, misalignedNodes },
    propagation: { checked: opts.planNodes.length, unaddressedNodes },
    noise: { totalSources: opts.totalTopSources, citedCount, unusedPct },
    score,
  };
}
