/**
 * GATE DIAGNOSIS — SEVA-style structured verification output (arXiv 2606.29713).
 *
 * A bare "check failed" string leaves the revision machinery guessing. Each
 * failed gate check is mapped to a typed diagnosis: WHAT class of failure,
 * HOW severe, and WHAT the actionable fix is. The regeneration feedback
 * (buildFailureFeedback) consumes these instead of raw reason strings, and
 * the audit trail gains a stable machine-readable failure taxonomy.
 *
 * Deterministic — zero LLM, zero cost. The LLM-side verifier enrichment can
 * layer on top later; the taxonomy stands alone.
 */

import type { PublicationGateCheck } from "./publication-gate";

export type DiagnosisCategory =
  | "evidence"       // not enough / weakly-bound sources
  | "composition"   // structure, length, missing required sections
  | "grounding"     // claims not tied to citations
  | "process"       // evaluator state problems (stale verdicts, signoff)
  | "adversarial"   // unresolved kill-shots / fatal challenges
  | "style";        // language quality (novlangue etc.)

export type DiagnosisSeverity = "terminal" | "blocking" | "advisory";

export interface GateDiagnosis {
  checkType: string;
  category: DiagnosisCategory;
  severity: DiagnosisSeverity;
  /** Short machine-stable code for metric aggregation. */
  code: string;
  /** Human/agent-readable: what to DO about it. */
  fix: string;
}

const DIAGNOSIS_MAP: Record<string, Omit<GateDiagnosis, "checkType">> = {
  source_depth: {
    category: "evidence",
    severity: "terminal",
    code: "EVIDENCE_INSUFFICIENT",
    fix: "Replace the topic — rewriting cannot conjure sources. Escalate to candidate fallback, do not regenerate.",
  },
  trust_score: {
    category: "evidence",
    severity: "terminal",
    code: "TRUST_BELOW_FLOOR",
    fix: "Corpus cannot support the claims at the required confidence. Replace candidate rather than rewrite.",
  },
  quality_score: {
    category: "composition",
    severity: "blocking",
    code: "QUALITY_BELOW_BAR",
    fix: "Strengthen analytical depth: causal mechanisms, counter-evidence handling, and concrete implications. Regeneration with priorFailureFeedback is appropriate.",
  },
  citation_coverage: {
    category: "grounding",
    severity: "blocking",
    code: "CITATION_COVERAGE_LOW",
    fix: "Bind existing claims to cited sources; run citation-repair injection, then re-verify coverage before any prose revision.",
  },
  word_count: {
    category: "composition",
    severity: "advisory",
    code: "LENGTH_SHORT",
    fix: "Expand the analysis sections — deepen evidence discussion rather than padding.",
  },
  claim_citation_density: {
    category: "grounding",
    severity: "blocking",
    code: "UNCITED_CLAIM_RATIO",
    fix: "Attach [SRC-N] to uncited factual claims or remove claims that no source supports — citation laundering check will verify binding.",
  },
  fatal_challenges: {
    category: "adversarial",
    severity: "blocking",
    code: "FATAL_CHALLENGES_OPEN",
    fix: "Address each fatal challenge explicitly in the text or concede and reframe the claim — the kill shot must be answered, not bypassed.",
  },
  devils_advocate: {
    category: "adversarial",
    severity: "blocking",
    code: "DA_PUBLISHABILITY_LOW",
    fix: "Raise publishability: resolve the top adversarial challenges and the kill shot, then re-run the DA re-check on the corrected artifact.",
  },
  researcher_signoff: {
    category: "process",
    severity: "blocking",
    code: "SIGNOFF_MISSING",
    fix: "Obtain researcher approval — inspect the signoff refusal reason before retrying.",
  },
  novlangue_density: {
    category: "style",
    severity: "advisory",
    code: "EUPHEMISM_DENSITY",
    fix: "Replace detected euphemisms with their true names — each flagged term has a precise replacement.",
  },
  central_scenario: {
    category: "composition",
    severity: "blocking",
    code: "CENTRAL_SCENARIO_INVALID",
    fix: "Reconcile the rendered central scenario with the persisted editorial decision — exactly one complete block, rationale carrying in-range [SRC-N] refs.",
  },
  evaluation_freshness: {
    category: "process",
    severity: "terminal",
    code: "STALE_EVALUATION",
    fix: "A verdict was computed against a replaced artifact version. Re-run the stale evaluator before publication — never re-gate on the stale verdict.",
  },
  thesis_adherence: {
    category: "evidence",
    severity: "blocking",
    code: "THESIS_BREACH",
    fix: "The verdict exceeds the thesis bound to corpus evidence. Narrow the claim to what the bound thesis supports (or the corpus must grow — prose cannot fix an evidence-ceiling breach). Regeneration with priorFailureFeedback carries the bound statement to the analyst.",
  },
};

const DEFAULT_DIAGNOSIS: Omit<GateDiagnosis, "checkType"> = {
  category: "composition",
  severity: "advisory",
  code: "UNCLASSIFIED_FAILURE",
  fix: "Inspect the check details and address the underlying issue before resubmission.",
};

/** Map a single check to its typed diagnosis. */
export function diagnoseCheck(check: PublicationGateCheck): GateDiagnosis {
  const mapped = DIAGNOSIS_MAP[check.checkType] ?? DEFAULT_DIAGNOSIS;
  return { checkType: check.checkType, ...mapped };
}

/** All diagnoses for a gate result — failing checks only. */
export function diagnoseGateResult(checks: PublicationGateCheck[]): GateDiagnosis[] {
  return checks.filter((c) => !c.passed).map(diagnoseCheck);
}

/** Compact serialization for feedback blocks / logs. */
export function renderDiagnoses(diagnoses: GateDiagnosis[]): string {
  return diagnoses
    .map((d) => `[${d.code}/${d.severity}] ${d.checkType}: ${d.fix}`)
    .join("\n");
}
