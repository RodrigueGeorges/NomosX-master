"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import type { ParsedEditorialInquiry } from "@/lib/brand/inquiry-html-parse";
import { cn } from "@/lib/utils";
import { nx } from "@/lib/brand/public-ui";
import { AlertTriangle, Users, FileSearch, Link2 } from "lucide-react";

interface EditorialInquiryBodyProps {
  data: ParsedEditorialInquiry;
  className?: string;
}

function Eyebrow({ children, anchorId }: { children: React.ReactNode; anchorId?: string }) {
  const t = useTranslations("Inquiry");
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    if (!anchorId) return;
    const url = `${window.location.origin}${window.location.pathname}#${anchorId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
    history.replaceState(null, "", `#${anchorId}`);
  };

  return (
    <div className="group/eyebrow flex items-center gap-1.5 mb-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 dark:text-white/50">{children}</p>
      {anchorId && (
        <button
          type="button"
          onClick={copyLink}
          title={copied ? t("sectionLinkCopied") : t("copySectionLink")}
          aria-label={t("copySectionLink")}
          className="opacity-0 group-hover/eyebrow:opacity-100 focus:opacity-100 transition-opacity text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
        >
          {copied ? <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">§</span> : <Link2 size={11} strokeWidth={1.5} />}
        </button>
      )}
    </div>
  );
}

function parseListItemsSafe(html: string): string[] {
  if (!html) return [];
  return [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function Block({ children, className, id, tocLabel }: { children: React.ReactNode; className?: string; id?: string; tocLabel?: string }) {
  return (
    <section id={id} data-toc={tocLabel} className={cn("mb-10 pb-10 border-b border-black/[0.08] dark:border-white/[0.08] last:border-0 last:pb-0 scroll-mt-24", className)}>
      {children}
    </section>
  );
}

/** Shared prose styling for pipeline-generated HTML fragments. */
const proseBlock = cn(
  nx.prose,
  "text-black/80 dark:text-white/80 [&_p]:text-[1rem] [&_p]:leading-[1.7]"
);

export function EditorialInquiryBody({ data, className }: EditorialInquiryBodyProps) {
  const t = useTranslations("Editorial");

  // Pull quote — the strongest sentence of the institute position,
  // lifted mid-body like a magazine pull quote.
  const pullQuote = (() => {
    const text = (data.verdictHtml || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const sentences = text.match(/[^.!?]+[.!?]/g) ?? [];
    return sentences.map((s) => s.trim()).find((s) => s.length >= 80 && s.length <= 300) ?? null;
  })();

  return (
    <div className={cn("max-w-3xl", className)}>
      {/* ── 1. Institute position (verdict) — the executive summary ── */}
      {data.verdictHtml && (
        <Block id="position" tocLabel={t("position")}>
          <Eyebrow anchorId="position">{t("position")}</Eyebrow>
          <div
            className={cn(proseBlock, "[&_p]:text-[1.0625rem] [&_p]:leading-[1.75]")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.verdictHtml) }}
          />
          {data.confidence && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-black/45 dark:text-white/45">
              {data.confidence}
            </p>
          )}
        </Block>
      )}

      {/* ── 2. Key findings ── */}
      {data.keyFindingsHtml && (
        <Block id="findings" tocLabel={t("findings")}>
          <Eyebrow anchorId="findings">{t("findings")}</Eyebrow>
          <ul className="space-y-2">
            {parseListItemsSafe(data.keyFindingsHtml).map((f) => (
              <li key={f} className="text-sm text-black/70 dark:text-white/70 leading-relaxed pl-4 border-l border-black/20 dark:border-white/20">
                {f}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* ── 3. Policy recommendations — up front, like EMPN key recommendations ── */}
      {data.recommendationsHtml && (
        <Block id="recommendations" tocLabel={t("recommendations")}>
          <Eyebrow anchorId="recommendations">{t("recommendations")}</Eyebrow>
          <div
            className={cn(proseBlock, "[&_ul]:space-y-1.5 [&_li]:text-sm [&_li]:leading-relaxed")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.recommendationsHtml) }}
          />
        </Block>
      )}

      {/* ── 4. Evidence base ── */}
      {data.anchoringBasisHtml && (
        <Block id="evidence" tocLabel={t("evidence")}>
          <Eyebrow anchorId="evidence">{t("evidence")}</Eyebrow>
          <div
            className={proseBlock}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.anchoringBasisHtml) }}
          />
        </Block>
      )}

      {pullQuote && (
        <blockquote className="my-10 -mx-2 px-6 py-6 border-y border-black/[0.1] dark:border-white/[0.1]">
          <p className="font-display text-xl md:text-2xl leading-snug text-black dark:text-white max-w-2xl">
            &ldquo;{pullQuote}&rdquo;
          </p>
          <cite className="mt-3 block font-mono text-[10px] uppercase tracking-[0.18em] text-black/40 dark:text-white/40 not-italic">
            — {t("researchDesk")}
          </cite>
        </blockquote>
      )}

      {data.causalChainHtml && (
        <Block>
          <Eyebrow>{t("causalChain")}</Eyebrow>
          <div
            className={cn(proseBlock, "[&_.chain-claim]:text-black/85 [&_.chain-claim]:dark:text-white/85 [&_.chain-evidence]:text-black/60 [&_.chain-evidence]:dark:text-white/60 [&_.chain-warrant]:text-black/60 [&_.chain-warrant]:dark:text-white/60 [&_.chain-label]:font-mono [&_.chain-label]:text-[10px] [&_.chain-label]:uppercase [&_.chain-label]:tracking-[0.12em] [&_.chain-label]:text-black/60 [&_.chain-label]:dark:text-white/60 [&_.chain-status]:inline-block [&_.chain-status]:font-mono [&_.chain-status]:text-[9px] [&_.chain-status]:uppercase [&_.chain-status]:tracking-[0.1em] [&_.chain-status]:px-1.5 [&_.chain-status]:py-0.5 [&_.chain-status]:border [&_.chain-status]:border-black/[0.1] [&_.chain-status]:dark:border-white/[0.1] [&_.chain-status]:mb-2 [&_.chain-status-present_fact]:border-black/30 [&_.chain-status-present_fact]:text-black/70 [&_.chain-status-present_fact]:dark:border-white/30 [&_.chain-status-present_fact]:dark:text-white/70 [&_.chain-status-active_mechanism]:border-black/20 [&_.chain-status-active_mechanism]:dark:border-white/20 [&_.chain-status-future_extrapolation]:border-indigo-400/30 [&_.chain-status-future_extrapolation]:text-indigo-500/80 [&_.chain-status-future_extrapolation]:dark:text-indigo-400/70")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.causalChainHtml) }}
          />
        </Block>
      )}

      {data.evidenceAssessmentHtml && (
        <Block>
          <Eyebrow>{t("evidenceAssessment")}</Eyebrow>
          <div
            className={cn(proseBlock, "[&_ul]:space-y-1.5 [&_li]:text-sm [&_.chain-label]:font-mono [&_.chain-label]:text-[10px] [&_.chain-label]:uppercase [&_.chain-label]:tracking-[0.12em] [&_.chain-label]:text-black/50 [&_.chain-label]:dark:text-white/50 [&_.weakest-link]:text-rose-600/70 [&_.weakest-link]:dark:text-rose-400/50")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.evidenceAssessmentHtml) }}
          />
        </Block>
      )}

      {/* ── 5. Futures ── */}
      {data.centralScenario && (
        <Block id="scenario" tocLabel={t("centralScenario")} className="border-l-2 border-l-black dark:border-l-white pl-5">
          <Eyebrow anchorId="scenario">{t("centralScenario")}</Eyebrow>
          <h2 className="text-xl font-semibold text-black dark:text-white mb-3">{data.centralScenario.name}</h2>
          <p className="text-xs text-black/60 dark:text-white/60 mb-4">{t("horizon")}: {data.centralScenario.horizon} · {t("editorialConfidence")}: {data.centralScenario.confidence}</p>
          <p className="text-black/80 dark:text-white/80 leading-relaxed mb-4">{data.centralScenario.description}</p>
          <h3 className="font-medium text-black dark:text-white mb-2">{t("whySelect")}</h3>
          <div className="text-sm text-black/70 dark:text-white/70 leading-relaxed mb-4" dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.centralScenario.rationaleHtml) }} />
          <h3 className="font-medium text-black dark:text-white mb-2">{t("implications")}</h3>
          <ul className="list-disc pl-5 mb-4 text-sm text-black/70 dark:text-white/70 space-y-2">{data.centralScenario.implications.map((s, i) => <li key={i}>{s}</li>)}</ul>
          <h3 className="font-medium text-black dark:text-white mb-2">{t("changeView")}</h3>
          <ul className="list-disc pl-5 text-sm text-black/70 dark:text-white/70 space-y-2">{data.centralScenario.revisionTriggers.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </Block>
      )}

      {data.scenarios.length > 0 && (
        <Block>
          <details>
          <summary className="cursor-pointer font-medium text-black dark:text-white mb-3">{data.centralScenario ? t("alternatives") : t("scenarioAnalysis")}</summary>
          <div className="space-y-3">
            {data.scenarios.map((s) => (
              <div
                key={s.name}
                className={cn(
                  "border border-black/[0.08] dark:border-white/[0.08] p-4",
                  s.isBase && "border-black/[0.14] dark:border-white/[0.14] bg-black/[0.03] dark:bg-white/[0.03]"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <span className="text-sm font-medium text-black dark:text-white">
                    {s.name}
                    {s.isBase && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-black/40 dark:text-white/40">
                        {t("central")}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-sm text-black/70 dark:text-white/70 tabular-nums shrink-0">{s.probability}</span>
                </div>
                <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
          </details>
        </Block>
      )}

      {data.trajectoryHtml && (
        <Block>
          <Eyebrow>{t("trajectory")}</Eyebrow>
          <div
            className={proseBlock}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.trajectoryHtml) }}
          />
        </Block>
      )}

      {data.rejectedAltsHtml && (
        <Block>
          <Eyebrow>{t("rejected")}</Eyebrow>
          <div
            className={cn(proseBlock, "[&_.rejected-scenario]:text-black/80 [&_.rejected-scenario]:dark:text-white/80 [&_.rejected-why]:text-black/60 [&_.rejected-why]:dark:text-white/60 [&_.rejected-risk]:text-black/60 [&_.rejected-risk]:dark:text-white/60 [&_.chain-label]:font-mono [&_.chain-label]:text-[10px] [&_.chain-label]:uppercase [&_.chain-label]:tracking-[0.12em] [&_.chain-label]:text-rose-600/70 [&_.chain-label]:dark:text-rose-400/60")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.rejectedAltsHtml) }}
          />
        </Block>
      )}

      {data.signalsHtml && (
        <Block>
          <Eyebrow>{t("signals")}</Eyebrow>
          <div
            className={cn(proseBlock, "[&_ul]:space-y-1.5 [&_li]:text-sm [&_.chain-label]:font-mono [&_.chain-label]:text-[10px] [&_.chain-label]:uppercase [&_.chain-label]:tracking-[0.12em] [&_.chain-label]:text-black/60 [&_.chain-label]:dark:text-white/60")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.signalsHtml) }}
          />
        </Block>
      )}

      {/* ── 6. Counterpoints ── */}
      {data.objections.length > 0 && (
        <Block id="counterpoints" tocLabel={t("objections")}>
          <Eyebrow anchorId="counterpoints">{t("objections")}</Eyebrow>
          <ul className="space-y-3">
            {data.objections.map((o) => (
              <li key={o} className="flex gap-3 text-sm text-black/65 dark:text-white/65 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-black/50 dark:text-white/50 shrink-0 mt-0.5" strokeWidth={1.25} />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.whatChangesMind.length > 0 && (
        <Block>
          <Eyebrow>{t("changeMind")}</Eyebrow>
          <ul className="space-y-2">
            {data.whatChangesMind.map((w) => (
              <li key={w} className="text-sm text-black/60 dark:text-white/60 leading-relaxed pl-4 border-l border-black/[0.1] dark:border-white/[0.1]">
                {w}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* ── 7. Process transparency — collapsed at the end, not the opening ── */}
      {(data.collision || data.detectedReason || data.team.length > 0 || data.evidenceTraceHtml) && (
        <details className="mb-10 group">
          <summary className="cursor-pointer flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 dark:text-white/45 hover:text-black/70 dark:hover:text-white/70 transition-colors">
            <FileSearch className="w-3.5 h-3.5" strokeWidth={1.5} />
            {t("howProduced")}
          </summary>
          <div className="mt-6 space-y-8">
            {(data.collision || data.detectedReason) && (
              <div>
                <Eyebrow>{t("detectedSubject")}</Eyebrow>
                {data.collision && (
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-black/50 dark:text-white/50 mb-2">{data.collision}</p>
                )}
                {data.detectedReason && (
                  <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed mb-3">{data.detectedReason}</p>
                )}
                {data.urgency && (
                  <span className="inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40 border border-black/[0.1] dark:border-white/[0.1] px-2 py-1">
                    {data.urgency}
                  </span>
                )}
              </div>
            )}

            {data.team.length > 0 && (
              <div>
                <Eyebrow>{t("team")}</Eyebrow>
                {data.productiveFriction && (
                  <p className="text-sm text-black/50 dark:text-white/50 mb-4 leading-relaxed">{data.productiveFriction}</p>
                )}
                <div className="grid sm:grid-cols-2 gap-3">
                  {data.team.map((member) => (
                    <div
                      key={`${member.role}-${member.domain}`}
                      className="border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] p-4"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-3.5 h-3.5 text-black/50 dark:text-white/50" strokeWidth={1.25} />
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-black/70 dark:text-white/70">
                          {member.role} lens
                        </span>
                      </div>
                      <p className="text-xs text-black/40 dark:text-white/40 mb-2">{member.domain}</p>
                      <p className="text-sm text-black/60 dark:text-white/60 leading-relaxed">
                        {member.mandate}
                        {member.frictionWith && (
                          <span className="text-black/50 dark:text-white/50"> ↔ {member.frictionWith}</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.evidenceTraceHtml && (
              <div>
                <Eyebrow>{t("evidenceTrace")}</Eyebrow>
                <div
                  className={cn(proseBlock, "text-black/65 dark:text-white/65")}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.evidenceTraceHtml) }}
                />
              </div>
            )}
          </div>
        </details>
      )}

      {data.sourcesHtml && (
        <section id="sources" data-toc={t("sources")} className="mt-12 pt-8 border-t border-black/[0.08] dark:border-white/[0.08] scroll-mt-24">
          <Eyebrow anchorId="sources">{t("sources")}</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/60 dark:text-white/60 text-sm [&_a]:text-black/60 [&_a]:dark:text-white/60")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.sourcesHtml) }}
          />
        </section>
      )}
    </div>
  );
}
