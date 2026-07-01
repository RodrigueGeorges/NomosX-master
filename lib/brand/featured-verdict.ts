import type { FeaturedVerdictData } from "@/components/signature/FeaturedVerdictCard";
import {
  extractBriefSummary,
  extractDetectedSubject,
  extractInstituteVerdict,
  isPositionFirstBrief,
} from "@/lib/agent/brief-html-extract";

export interface FeaturedBriefSource {
  id: string;
  title: string;
  html?: string | null;
  publishedAt?: Date | string | null;
  sourceIds?: string[] | null;
  trustScore?: number | null;
  criticalLoopResult?: unknown;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractConfidence(html: string, trustScore?: number | null): string {
  const m = html.match(/Confidence\s+(\d+)\/100/i);
  if (m) return `${m[1]}%`;
  if (trustScore != null) return `${trustScore}%`;
  return "—";
}

function extractObjectionCount(html: string): number {
  const section = html.match(/Strongest objections<\/p>\s*<ul>([\s\S]*?)<\/ul>/i);
  if (!section) return 0;
  return (section[1].match(/<li/gi) || []).length;
}

function extractSimulationLabel(html: string, meta: Record<string, unknown>): string {
  const rows = (html.match(/class="scenario-row"/g) || []).length;
  const sim = meta.simulation as { scenarios?: unknown[] } | undefined;
  const scenarioCount = sim?.scenarios?.length ?? rows;
  if (scenarioCount > 0) return `${scenarioCount} trajectories`;
  const foresight = meta.foresight as { monteCarloRuns?: number } | undefined;
  if (foresight?.monteCarloRuns) return `${foresight.monteCarloRuns} runs`;
  return "Probable futures";
}

function splitVerdict(teaser: string): { prefix: string; body: string } {
  const clean = teaser.replace(/\[SRC-\d+\]/g, "").trim();
  const dash = clean.indexOf(" — ");
  if (dash > 0 && dash < 48) {
    return { prefix: clean.slice(0, dash).trim(), body: clean.slice(dash + 3).trim() };
  }
  const lead = clean.match(/^(Yes|No|Likely|Unlikely|Partially|Probably|Uncertain)[,.]?\s*/i);
  if (lead) {
    return {
      prefix: lead[1],
      body: clean.slice(lead[0].length).trim() || clean,
    };
  }
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean;
  if (firstSentence.length < 60) {
    return { prefix: "Position", body: clean };
  }
  return { prefix: "Position", body: firstSentence };
}

function formatUpdatedAt(publishedAt?: Date | string | null): string {
  if (!publishedAt) return "—";
  return new Date(publishedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();
}

function formatSerialId(id: string, publishedAt?: Date | string | null): string {
  const d = publishedAt ? new Date(publishedAt) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const tail = id.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() || "0001";
  return `NX-${yyyy}-${mm}${dd}-${tail}`;
}

function sparklineFromConfidence(confidence: string): number[] {
  const n = parseInt(confidence, 10);
  if (Number.isNaN(n)) return [52, 58, 61, 68, 72, 74, 73, 74];
  const base = Math.max(20, n - 12);
  return [base, base + 4, base + 7, base + 10, base + 12, n, n - 1, n];
}

/** Map latest publication → homepage FeaturedVerdictCard data. */
export function buildFeaturedVerdict(brief: FeaturedBriefSource): FeaturedVerdictData | null {
  const rawHtml = (brief.html || "").replace(/^```html?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  if (!rawHtml && !brief.title) return null;

  const meta = (brief.criticalLoopResult ?? {}) as Record<string, unknown>;
  const instituteVerdict = rawHtml ? extractInstituteVerdict(rawHtml) : "";
  const summary = rawHtml ? extractBriefSummary(rawHtml) : "";
  const teaser = instituteVerdict || summary || brief.title;
  const { prefix, body } = splitVerdict(teaser);

  const question =
    (rawHtml && isPositionFirstBrief(rawHtml) ? extractDetectedSubject(rawHtml) : "") ||
    brief.title;

  const confidence = rawHtml ? extractConfidence(rawHtml, brief.trustScore) : `${brief.trustScore ?? "—"}%`;

  return {
    question,
    verdictPrefix: prefix,
    verdictBody: body,
    confidence,
    simulation: rawHtml ? extractSimulationLabel(rawHtml, meta) : "Probable futures",
    sources: brief.sourceIds?.length ?? 0,
    objections: rawHtml ? extractObjectionCount(rawHtml) : 0,
    updatedAt: formatUpdatedAt(brief.publishedAt),
    serialId: formatSerialId(brief.id, brief.publishedAt),
    sparkline: sparklineFromConfidence(confidence),
  };
}

export const FALLBACK_FEATURED_VERDICT: FeaturedVerdictData = {
  question: "Will sovereign AI infrastructure reshape European policy?",
  verdictPrefix: "Yes",
  verdictBody: "consolidation is likely around sovereign infrastructure models.",
  confidence: "74%",
  simulation: "3 trajectories",
  sources: 42,
  objections: 3,
  updatedAt: "MAY 18, 2026",
  serialId: "NX-2026-0518-01",
  sparkline: [52, 58, 61, 68, 72, 74, 73, 74],
};
