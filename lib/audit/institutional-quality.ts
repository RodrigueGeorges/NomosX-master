/**
 * NomosX — Institutional Quality Audit Engine
 *
 * Benchmarks: France Stratégie · Harvard/Brookings · McKinsey GMI · RAND
 * Pure functions — no side effects. Used by scripts/institutional-quality-audit.ts
 */

import {
  buildEvidenceLedger,
  extractCitationNumbers,
  stripHtmlForEvidence,
} from "@/lib/agent/evidence-ledger";
import { evaluatePublicationGate } from "@/lib/agent/publication-gate";
import { citationGuard } from "@/lib/agent/pipeline-v2";
import {
  evaluatePublicationReadiness,
  getPublicationQualityRule,
} from "@/lib/publication-visibility";
import { htmlHasForesightSection } from "@/lib/foresight";
import { FORBIDDEN_PHRASES } from "@/lib/think-tank/types";
import { PUBLICATION_TEMPLATES } from "@/lib/think-tank/templates";

// ─── Types ───────────────────────────────────────────────────────────────────

export type InstitutionalTier = "platinum" | "gold" | "silver" | "bronze" | "fail";

export type BenchmarkId = "france_strategie" | "harvard_brookings" | "mckinsey" | "rand" | "nomosx_gate";

export interface AuditCheck {
  id: string;
  label: string;
  passed: boolean;
  score: number;
  maxScore: number;
  weight: number;
  details: string;
  benchmark?: BenchmarkId;
  severity: "critical" | "major" | "minor";
}

export interface PublicationAuditInput {
  id: string;
  publicId?: string | null;
  title: string;
  type: string;
  status: string;
  html: string;
  wordCount: number;
  trustScore: number;
  qualityScore: number;
  citationCoverage: number;
  sourceIds: string[];
  publishedAt?: Date | null;
  criticalLoopResult?: Record<string, unknown> | null;
  sourceMeta?: Array<{ id: string; provider: string; qualityScore: number | null; doi: string | null }>;
}

export interface PublicationAuditResult {
  publicationId: string;
  publicId?: string | null;
  title: string;
  type: string;
  status: string;
  compositeScore: number;
  tier: InstitutionalTier;
  readinessOk: boolean;
  gateDecision: "publish" | "revise" | "hold";
  checks: AuditCheck[];
  failures: string[];
  warnings: string[];
  benchmarks: Record<BenchmarkId, { passed: boolean; score: number; gaps: string[] }>;
  metrics: Record<string, number | string | boolean>;
}

export interface PipelineHealthSnapshot {
  pipelineRuns: { total: number; running: number; failed: number; completed: number; stuckRunning: number };
  publications: { total: number; published: number; held: number; missingPublicId: number };
  foresight: { withSimulation: number; withForesightPanel: number; withForesightRun: number };
  briefs: { withLineage: number; withSimulation: number };
  jobs?: { failedLast7d: number; pending: number };
}

// ─── Section patterns (FR + EN) ──────────────────────────────────────────────

const SECTION_HINTS: Record<string, RegExp> = {
  executive_summary: /executive summary|synthèse exécutive|résumé exécutif|executive/i,
  limitations: /limit|uncertaint|incertitud|ce qui changerait|what would change|open question|questions ouvertes/i,
  scenarios: /scénario|scenario|simulated outcome|simulated outcomes|foresight/i,
  debate: /debate|débat|steel.?man|controvers|position 1|position 2|pro:|con:/i,
  recommendations: /recommend|recommand|implication|strategic|feuille de route|roadmap/i,
  methodology: /methodolog|evidence quality|qualité des preuves|méthodolog/i,
  stakeholders: /stakeholder|parties prenantes|acteurs/i,
  consensus: /consensus|accord|convergence/i,
  risks: /risk|risque|limitation/i,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function countWordsHtml(html: string): number {
  const text = stripHtmlForEvidence(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function detectMarkdownArtifacts(html: string): boolean {
  const raw = html.replace(/^```html?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return /^#{1,3}\s|\*\*[^*]+\*\*|^- /m.test(raw.slice(0, 2000));
}

export function detectForbiddenPhrases(html: string): string[] {
  const lower = html.toLowerCase();
  return FORBIDDEN_PHRASES.filter((p) => lower.includes(p.toLowerCase()));
}

export function detectSections(html: string): Record<string, boolean> {
  const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
  const out: Record<string, boolean> = {};
  for (const [key, re] of Object.entries(SECTION_HINTS)) {
    out[key] = re.test(text);
  }
  return out;
}

export function tierFromScore(score: number): InstitutionalTier {
  if (score >= 90) return "platinum";
  if (score >= 80) return "gold";
  if (score >= 70) return "silver";
  if (score >= 60) return "bronze";
  return "fail";
}

export function tierLabel(tier: InstitutionalTier): string {
  const labels: Record<InstitutionalTier, string> = {
    platinum: "Platinum — dépasse France Stratégie / Harvard",
    gold: "Gold — standard think tank tier-1",
    silver: "Silver — publiable avec relecture",
    bronze: "Bronze — retenir / réviser",
    fail: "Fail — ne pas publier",
  };
  return labels[tier];
}

function addCheck(
  checks: AuditCheck[],
  check: Omit<AuditCheck, "weight"> & { weight?: number }
): void {
  checks.push({ weight: 1, ...check });
}

function weightedScore(checks: AuditCheck[]): number {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const earned = checks.reduce((s, c) => s + (c.score / c.maxScore) * c.weight, 0);
  return Math.round((earned / totalWeight) * 100);
}

function providerDiversity(sourceMeta: PublicationAuditInput["sourceMeta"]): number {
  if (!sourceMeta?.length) return 0;
  return new Set(sourceMeta.map((s) => s.provider.split(":")[0] || s.provider)).size;
}

function avgSourceQuality(sourceMeta: PublicationAuditInput["sourceMeta"]): number {
  if (!sourceMeta?.length) return 0;
  const scores = sourceMeta.map((s) => s.qualityScore ?? 0).filter((n) => n > 0);
  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function extractMetaScores(meta: Record<string, unknown> | null | undefined) {
  const da = meta?.devilsAdvocate as Record<string, unknown> | undefined;
  const daResult = da?.result as Record<string, unknown> | undefined;
  const gate = meta?.publicationGate as Record<string, unknown> | undefined;
  const critical = meta?.criticalLoopResult as Record<string, unknown> | undefined;
  const cl = (meta?.criticalLoop ?? critical) as Record<string, unknown> | undefined;

  return {
    devilsAdvocateVerdict: String(meta?.devilsAdvocateVerdict ?? da?.verdict ?? daResult?.verdict ?? ""),
    devilsAdvocateScore: Number(
      da?.publishabilityScore ?? daResult?.publishabilityScore ?? da?.overallScore ?? 0
    ),
    institutionBenchmark: da?.vsInstitutionBenchmark as Record<string, number> | undefined,
    compositeCriticalLoop: Number(cl?.compositeScore ?? meta?.compositeScore ?? 0),
    hasForesightBundle: Boolean(meta?.foresight ?? meta?.simulation),
    hasForesightRun: Boolean(meta?.foresightRun),
    architecture: String(meta?.architecture ?? ""),
    briefId: String(meta?.briefId ?? ""),
    depth: String(meta?.depth ?? ""),
  };
}

// ─── Core publication audit ──────────────────────────────────────────────────

export function auditPublication(input: PublicationAuditInput): PublicationAuditResult {
  const checks: AuditCheck[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];

  const html = input.html ?? "";
  const sourceCount = input.sourceIds?.length ?? 0;
  const meta = (input.criticalLoopResult ?? {}) as Record<string, unknown>;
  const metaScores = extractMetaScores(meta);
  const sections = detectSections(html);
  const forbidden = detectForbiddenPhrases(html);
  const hasMarkdown = detectMarkdownArtifacts(html);
  const wordCount = input.wordCount || countWordsHtml(html);
  const h2Count = (html.match(/<h2[^>]*>/gi) ?? []).length;
  const ledger = buildEvidenceLedger(html);
  const citations = extractCitationNumbers(html);
  const invalidCitations = citations.filter((n) => n > sourceCount);
  const uncitedRatio =
    ledger.claimCount > 0 ? ledger.uncitedClaimCount / ledger.claimCount : 1;
  const provDiv = providerDiversity(input.sourceMeta);
  const srcQualityAvg = avgSourceQuality(input.sourceMeta);
  const readiness = evaluatePublicationReadiness(input);
  const rule = getPublicationQualityRule(input.type);
  const format =
    input.type === "STRATEGIC_REPORT" || input.type === "DOSSIER"
      ? "strategic"
      : input.type === "SUMMARY_BRIEF"
        ? "signal"
        : "brief";

  const gate = evaluatePublicationGate({
    format,
    html,
    sourceIds: input.sourceIds,
    trustScore: input.trustScore,
    qualityScore: input.qualityScore,
    citationCoverage: input.citationCoverage,
    devilsAdvocateScore:
      metaScores.devilsAdvocateScore > 0 ? metaScores.devilsAdvocateScore : undefined,
    fatalChallenges: metaScores.devilsAdvocateVerdict === "reject" ? 1 : 0,
  });

  const guard = citationGuard({ html }, sourceCount);

  // ── Epistemic rigor (RAND / Harvard) ──
  addCheck(checks, {
    id: "citation_presence",
    label: "Citations [SRC-N] présentes",
    passed: ledger.uniqueCitationCount >= Math.min(4, sourceCount),
    score: Math.min(100, Math.round((ledger.uniqueCitationCount / Math.max(sourceCount, 1)) * 100)),
    maxScore: 100,
    weight: 2,
    details: `${ledger.uniqueCitationCount} sources citées / ${sourceCount} disponibles`,
    benchmark: "harvard_brookings",
    severity: ledger.uniqueCitationCount === 0 ? "critical" : "major",
  });

  addCheck(checks, {
    id: "invalid_citations",
    label: "Citations invalides (SRC > sources)",
    passed: invalidCitations.length === 0,
    score: invalidCitations.length === 0 ? 100 : 0,
    maxScore: 100,
    weight: 2,
    details:
      invalidCitations.length === 0
        ? "Toutes les citations référencent des sources valides"
        : `Invalides: [SRC-${invalidCitations.join("], [SRC-")}]`,
    benchmark: "rand",
    severity: "critical",
  });

  addCheck(checks, {
    id: "uncited_claims",
    label: "Ratio claims non citées",
    passed: uncitedRatio <= 0.35,
    score: Math.round(Math.max(0, (1 - uncitedRatio) * 100)),
    maxScore: 100,
    weight: 2,
    details: `${ledger.uncitedClaimCount}/${ledger.claimCount} claims sans [SRC-N] (${Math.round(uncitedRatio * 100)}%)`,
    benchmark: "mckinsey",
    severity: uncitedRatio > 0.5 ? "critical" : "major",
  });

  addCheck(checks, {
    id: "forbidden_phrases",
    label: "Phrases interdites (épistémique)",
    passed: forbidden.length === 0,
    score: forbidden.length === 0 ? 100 : 0,
    maxScore: 100,
    weight: 1.5,
    details:
      forbidden.length === 0 ? "Aucune phrase interdite" : `Trouvé: ${forbidden.join(", ")}`,
    benchmark: "harvard_brookings",
    severity: "critical",
  });

  addCheck(checks, {
    id: "citation_coverage",
    label: "Couverture citationnelle",
    passed: input.citationCoverage >= rule.minCitationCoverage,
    score: Math.round(Math.min(100, (input.citationCoverage / rule.minCitationCoverage) * 100)),
    maxScore: 100,
    weight: 1.5,
    details: `${Math.round(input.citationCoverage * 100)}% (min ${Math.round(rule.minCitationCoverage * 100)}%)`,
    benchmark: "rand",
    severity: "major",
  });

  // ── Structure (McKinsey / France Stratégie) ──
  addCheck(checks, {
    id: "executive_summary",
    label: "Synthèse exécutive",
    passed: sections.executive_summary,
    score: sections.executive_summary ? 100 : 0,
    maxScore: 100,
    weight: 1.5,
    details: sections.executive_summary ? "Section détectée" : "Section manquante",
    benchmark: "mckinsey",
    severity: "major",
  });

  addCheck(checks, {
    id: "limitations",
    label: "Limites & incertitudes",
    passed: sections.limitations,
    score: sections.limitations ? 100 : 0,
    maxScore: 100,
    weight: 1.5,
    details: sections.limitations ? "Section détectée" : "Section manquante — requis RAND/France Stratégie",
    benchmark: "rand",
    severity: "major",
  });

  addCheck(checks, {
    id: "structure_depth",
    label: "Profondeur structurelle (H2)",
    passed: h2Count >= (input.type === "STRATEGIC_REPORT" ? 6 : 4),
    score: Math.min(100, Math.round((h2Count / Math.max(input.type === "STRATEGIC_REPORT" ? 6 : 4, 1)) * 100)),
    maxScore: 100,
    weight: 1,
    details: `${h2Count} sections H2`,
    benchmark: "mckinsey",
    severity: "minor",
  });

  if (input.type === "STRATEGIC_REPORT" || input.type === "DOSSIER") {
    addCheck(checks, {
      id: "scenarios",
      label: "Scénarios stratégiques",
      passed: sections.scenarios || htmlHasForesightSection(html),
      score: sections.scenarios || htmlHasForesightSection(html) ? 100 : 0,
      maxScore: 100,
      weight: 2,
      details: sections.scenarios
        ? "Section scénarios détectée"
        : htmlHasForesightSection(html)
          ? "Section Foresight HTML"
          : "Scénarios absents — requis France Stratégie",
      benchmark: "france_strategie",
      severity: "critical",
    });

    addCheck(checks, {
      id: "word_count_strategic",
      label: "Longueur rapport stratégique",
      passed: wordCount >= rule.minWordCount,
      score: Math.min(100, Math.round((wordCount / rule.minWordCount) * 100)),
      maxScore: 100,
      weight: 1.5,
      details: `${wordCount} mots (min ${rule.minWordCount})`,
      benchmark: "france_strategie",
      severity: "major",
    });
  }

  addCheck(checks, {
    id: "debate_steel_man",
    label: "Débat / contre-arguments",
    passed: sections.debate,
    score: sections.debate ? 100 : 40,
    maxScore: 100,
    weight: 1,
    details: sections.debate ? "Débat détecté" : "Pas de section débat — recommandé Harvard",
    benchmark: "harvard_brookings",
    severity: "minor",
  });

  // ── Sources (France Stratégie / RAND) ──
  addCheck(checks, {
    id: "source_depth",
    label: "Profondeur sources",
    passed: sourceCount >= rule.minSourceCount,
    score: Math.min(100, Math.round((sourceCount / rule.minSourceCount) * 100)),
    maxScore: 100,
    weight: 2,
    details: `${sourceCount} sources (min ${rule.minSourceCount})`,
    benchmark: "france_strategie",
    severity: "critical",
  });

  addCheck(checks, {
    id: "provider_diversity",
    label: "Diversité providers",
    passed: provDiv >= (input.type === "STRATEGIC_REPORT" ? 4 : 3),
    score: Math.min(100, Math.round((provDiv / (input.type === "STRATEGIC_REPORT" ? 4 : 3)) * 100)),
    maxScore: 100,
    weight: 1.5,
    details: `${provDiv} providers distincts`,
    benchmark: "france_strategie",
    severity: "major",
  });

  addCheck(checks, {
    id: "source_quality_avg",
    label: "Qualité moyenne sources",
    passed: srcQualityAvg >= 70 || !input.sourceMeta?.length,
    score: input.sourceMeta?.length ? Math.min(100, Math.round((srcQualityAvg / 70) * 100)) : 50,
    maxScore: 100,
    weight: 1,
    details: input.sourceMeta?.length
      ? `Score moyen ${srcQualityAvg}/100`
      : "Métadonnées sources non chargées",
    benchmark: "rand",
    severity: "minor",
  });

  // ── Scores & gate ──
  addCheck(checks, {
    id: "trust_score",
    label: "Trust score",
    passed: input.trustScore >= rule.minTrustScore,
    score: Math.min(100, Math.round((input.trustScore / rule.minTrustScore) * 100)),
    maxScore: 100,
    weight: 2,
    details: `${input.trustScore}/100 (min ${rule.minTrustScore})`,
    benchmark: "nomosx_gate",
    severity: "critical",
  });

  addCheck(checks, {
    id: "quality_score",
    label: "Quality score",
    passed: input.qualityScore >= rule.minQualityScore,
    score: Math.min(100, Math.round((input.qualityScore / rule.minQualityScore) * 100)),
    maxScore: 100,
    weight: 1.5,
    details: `${input.qualityScore}/100 (min ${rule.minQualityScore})`,
    benchmark: "nomosx_gate",
    severity: "major",
  });

  addCheck(checks, {
    id: "publication_gate",
    label: "Publication gate",
    passed: gate.decision === "publish",
    score: gate.decision === "publish" ? 100 : gate.decision === "revise" ? 55 : 20,
    maxScore: 100,
    weight: 2,
    details: `Décision: ${gate.decision}${gate.reasons.length ? ` — ${gate.reasons.slice(0, 2).join("; ")}` : ""}`,
    benchmark: "nomosx_gate",
    severity: gate.decision === "hold" ? "critical" : "major",
  });

  // ── Adversarial / pipeline metadata ──
  if (metaScores.devilsAdvocateScore > 0) {
    addCheck(checks, {
      id: "devils_advocate",
      label: "Devil's Advocate score",
      passed: metaScores.devilsAdvocateScore >= 70 && metaScores.devilsAdvocateVerdict !== "reject",
      score: metaScores.devilsAdvocateVerdict === "reject" ? 0 : metaScores.devilsAdvocateScore,
      maxScore: 100,
      weight: 1.5,
      details: `${metaScores.devilsAdvocateScore}/100 — verdict ${metaScores.devilsAdvocateVerdict || "n/a"}`,
      benchmark: "rand",
      severity: metaScores.devilsAdvocateVerdict === "reject" ? "critical" : "major",
    });
  }

  if (metaScores.compositeCriticalLoop > 0) {
    addCheck(checks, {
      id: "critical_loop",
      label: "Critical Loop V2 composite",
      passed: metaScores.compositeCriticalLoop >= 65,
      score: metaScores.compositeCriticalLoop,
      maxScore: 100,
      weight: 1,
      details: `Composite ${metaScores.compositeCriticalLoop}/100`,
      benchmark: "harvard_brookings",
      severity: "minor",
    });
  }

  // ── Foresight (NomosX différenciateur) ──
  const needsForesight =
    input.type === "STRATEGIC_REPORT" ||
    input.type === "DOSSIER" ||
    metaScores.depth === "deep" ||
    metaScores.depth === "strategic";

  if (needsForesight) {
    const hasForesight =
      htmlHasForesightSection(html) ||
      metaScores.hasForesightBundle ||
      metaScores.hasForesightRun;
    addCheck(checks, {
      id: "foresight_engine",
      label: "Foresight Engine v3",
      passed: hasForesight,
      score: hasForesight ? 100 : 0,
      maxScore: 100,
      weight: 1.5,
      details: hasForesight
        ? "Simulation / panel foresight présent"
        : "Foresight absent — différenciateur NomosX vs MiroFish",
      benchmark: "france_strategie",
      severity: "major",
    });
  }

  // ── Production hygiene ──
  addCheck(checks, {
    id: "html_clean",
    label: "HTML propre (pas Markdown)",
    passed: !hasMarkdown,
    score: hasMarkdown ? 0 : 100,
    maxScore: 100,
    weight: 1,
    details: hasMarkdown ? "Artefacts Markdown détectés" : "HTML valide",
    benchmark: "nomosx_gate",
    severity: "major",
  });

  addCheck(checks, {
    id: "lineage_trace",
    label: "Traçabilité pipeline",
    passed: Boolean(metaScores.briefId && metaScores.architecture),
    score: metaScores.briefId && metaScores.architecture ? 100 : metaScores.briefId ? 60 : 0,
    maxScore: 100,
    weight: 0.5,
    details: metaScores.architecture || "Pas de lineage orchestrator",
    benchmark: "nomosx_gate",
    severity: "minor",
  });

  addCheck(checks, {
    id: "citation_guard",
    label: "Citation guard pipeline",
    passed: guard.ok || ledger.uniqueCitationCount > 0,
    score: guard.ok ? 100 : ledger.uniqueCitationCount > 0 ? 70 : 0,
    maxScore: 100,
    weight: 0.5,
    details: guard.ok
      ? `${guard.usedCount} citations valides`
      : `Guard fail — invalid: ${guard.invalid.join(", ") || "none"}`,
    benchmark: "nomosx_gate",
    severity: "minor",
  });

  // ── Aggregate ──
  for (const c of checks.filter((x) => !x.passed)) {
    if (c.severity === "critical") failures.push(`${c.label}: ${c.details}`);
    else warnings.push(`${c.label}: ${c.details}`);
  }
  if (!readiness.ok) {
    for (const f of readiness.failures) failures.push(`Readiness: ${f}`);
  }

  const compositeScore = weightedScore(checks);
  const tier = tierFromScore(compositeScore);

  const benchmarks = evaluateBenchmarks({
    compositeScore,
    input,
    sections,
    wordCount,
    h2Count,
    provDiv,
    srcQualityAvg,
    uncitedRatio,
    ledger,
    metaScores,
    forbidden,
    hasMarkdown,
    gate,
    html,
  });

  return {
    publicationId: input.id,
    publicId: input.publicId,
    title: input.title,
    type: input.type,
    status: input.status,
    compositeScore,
    tier,
    readinessOk: readiness.ok,
    gateDecision: gate.decision,
    checks,
    failures,
    warnings,
    benchmarks,
    metrics: {
      wordCount,
      h2Count,
      sourceCount,
      providerDiversity: provDiv,
      sourceQualityAvg: srcQualityAvg,
      uniqueCitations: ledger.uniqueCitationCount,
      uncitedClaimRatio: Math.round(uncitedRatio * 100),
      trustScore: input.trustScore,
      qualityScore: input.qualityScore,
      citationCoveragePct: Math.round(input.citationCoverage * 100),
      hasForesight: htmlHasForesightSection(html) || metaScores.hasForesightBundle,
      devilsAdvocateScore: metaScores.devilsAdvocateScore,
      templateDefined: Boolean(PUBLICATION_TEMPLATES[input.type]),
    },
  };
}

function evaluateBenchmarks(ctx: {
  compositeScore: number;
  input: PublicationAuditInput;
  sections: Record<string, boolean>;
  wordCount: number;
  h2Count: number;
  provDiv: number;
  srcQualityAvg: number;
  uncitedRatio: number;
  ledger: ReturnType<typeof buildEvidenceLedger>;
  metaScores: ReturnType<typeof extractMetaScores>;
  forbidden: string[];
  hasMarkdown: boolean;
  gate: ReturnType<typeof evaluatePublicationGate>;
  html: string;
}): PublicationAuditResult["benchmarks"] {
  const gaps: Record<BenchmarkId, string[]> = {
    france_strategie: [],
    harvard_brookings: [],
    mckinsey: [],
    rand: [],
    nomosx_gate: [],
  };

  // France Stratégie
  if (ctx.input.type === "STRATEGIC_REPORT" && ctx.wordCount < 3500) {
    gaps.france_strategie.push(`Longueur ${ctx.wordCount} < 3500 mots`);
  }
  if (ctx.provDiv < 5 && ctx.input.type === "STRATEGIC_REPORT") {
    gaps.france_strategie.push(`Diversité providers ${ctx.provDiv} < 5`);
  }
  if (
    (ctx.input.type === "STRATEGIC_REPORT" || ctx.metaScores.depth === "deep") &&
    !ctx.sections.scenarios &&
    !htmlHasForesightSection(ctx.html)
  ) {
    gaps.france_strategie.push("Scénarios / Foresight absents");
  }

  // Harvard / Brookings
  if (ctx.ledger.uniqueCitationCount < ctx.input.sourceIds.length * 0.5) {
    gaps.harvard_brookings.push("Moins de 50% des sources citées");
  }
  if (!ctx.sections.debate) gaps.harvard_brookings.push("Pas de section débat steel-man");
  if (!ctx.sections.methodology && ctx.input.type !== "SUMMARY_BRIEF") {
    gaps.harvard_brookings.push("Évaluation méthodologique absente");
  }

  // McKinsey
  if (!ctx.sections.executive_summary) gaps.mckinsey.push("Synthèse exécutive absente");
  if (ctx.h2Count < 5) gaps.mckinsey.push(`Seulement ${ctx.h2Count} sections H2 (min 5)`);
  if (ctx.uncitedRatio > 0.25) gaps.mckinsey.push(`Claims non citées ${Math.round(ctx.uncitedRatio * 100)}% > 25%`);

  // RAND
  if (!ctx.sections.limitations) gaps.rand.push("Limites & incertitudes absentes");
  if (ctx.srcQualityAvg > 0 && ctx.srcQualityAvg < 72) {
    gaps.rand.push(`Qualité sources ${ctx.srcQualityAvg} < 72`);
  }
  if (ctx.metaScores.devilsAdvocateScore > 0 && ctx.metaScores.devilsAdvocateScore < 75) {
    gaps.rand.push(`Devil's Advocate ${ctx.metaScores.devilsAdvocateScore} < 75`);
  }

  // NomosX gate
  if (ctx.gate.decision !== "publish") gaps.nomosx_gate.push(`Gate: ${ctx.gate.decision}`);
  if (ctx.forbidden.length) gaps.nomosx_gate.push(`Phrases interdites: ${ctx.forbidden.length}`);
  if (ctx.hasMarkdown) gaps.nomosx_gate.push("Artefacts Markdown");

  const scoreFor = (id: BenchmarkId) => {
    const gapPenalty = gaps[id].length * 12;
    return Math.max(0, ctx.compositeScore - gapPenalty);
  };

  return {
    france_strategie: {
      passed: gaps.france_strategie.length === 0 && ctx.compositeScore >= 85,
      score: scoreFor("france_strategie"),
      gaps: gaps.france_strategie,
    },
    harvard_brookings: {
      passed: gaps.harvard_brookings.length === 0 && ctx.compositeScore >= 82,
      score: scoreFor("harvard_brookings"),
      gaps: gaps.harvard_brookings,
    },
    mckinsey: {
      passed: gaps.mckinsey.length === 0 && ctx.compositeScore >= 80,
      score: scoreFor("mckinsey"),
      gaps: gaps.mckinsey,
    },
    rand: {
      passed: gaps.rand.length === 0 && ctx.compositeScore >= 78,
      score: scoreFor("rand"),
      gaps: gaps.rand,
    },
    nomosx_gate: {
      passed: gaps.nomosx_gate.length === 0 && ctx.gate.decision === "publish",
      score: scoreFor("nomosx_gate"),
      gaps: gaps.nomosx_gate,
    },
  };
}

export function summarizeAuditResults(results: PublicationAuditResult[]) {
  const byTier: Record<InstitutionalTier, number> = {
    platinum: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    fail: 0,
  };
  for (const r of results) byTier[r.tier]++;

  const avgComposite =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.compositeScore, 0) / results.length)
      : 0;

  const benchmarkPassRates: Record<BenchmarkId, number> = {
    france_strategie: 0,
    harvard_brookings: 0,
    mckinsey: 0,
    rand: 0,
    nomosx_gate: 0,
  };
  for (const id of Object.keys(benchmarkPassRates) as BenchmarkId[]) {
    benchmarkPassRates[id] = results.filter((r) => r.benchmarks[id].passed).length;
  }

  return {
    total: results.length,
    avgComposite,
    byTier,
    failing: results.filter((r) => r.tier === "fail" || r.tier === "bronze").length,
    criticalFailures: results.filter((r) => r.failures.length > 0).length,
    benchmarkPassRates,
  };
}
