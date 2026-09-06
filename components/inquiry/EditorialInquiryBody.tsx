"use client";

import { sanitizeHtml } from "@/lib/sanitize";
import type { ParsedEditorialInquiry } from "@/lib/brand/inquiry-html-parse";
import { cn } from "@/lib/utils";
import { nx } from "@/lib/brand/public-ui";
import { AlertTriangle, Users } from "lucide-react";

interface EditorialInquiryBodyProps {
  data: ParsedEditorialInquiry;
  className?: string;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 mb-3">{children}</p>
  );
}

function parseListItemsSafe(html: string): string[] {
  if (!html) return [];
  return [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function Block({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mb-10 pb-10 border-b border-black/[0.08] last:border-0 last:pb-0", className)}>
      {children}
    </section>
  );
}

export function EditorialInquiryBody({ data, className }: EditorialInquiryBodyProps) {
  return (
    <div className={cn("max-w-3xl", className)}>
      {data.heroImageUrl && (
        <div className="mb-8 -mx-6 sm:-mx-8 overflow-hidden border-b border-black/[0.08]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.heroImageUrl}
            alt={data.collision || "Brief hero illustration"}
            className="w-full h-auto max-h-[480px] object-cover"
            style={{ filter: "brightness(0.92) contrast(1.08)" }}
          />
        </div>
      )}

      {(data.collision || data.detectedReason) && (
        <Block>
          <Eyebrow>Detected subject</Eyebrow>
          {data.collision && (
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-black/50 mb-2">{data.collision}</p>
          )}
          {data.detectedReason && (
            <p className="text-sm text-black/60 leading-relaxed mb-3">{data.detectedReason}</p>
          )}
          {data.urgency && (
            <span className="inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 border border-black/[0.1] px-2 py-1">
              {data.urgency}
            </span>
          )}
        </Block>
      )}

      {data.team.length > 0 && (
        <Block>
          <Eyebrow>Dedicated team</Eyebrow>
          {data.productiveFriction && (
            <p className="text-sm text-black/45 mb-4 leading-relaxed">{data.productiveFriction}</p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {data.team.map((member) => (
              <div
                key={`${member.role}-${member.domain}`}
                className="border border-black/[0.08] bg-black/[0.02] p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-3.5 h-3.5 text-black/50" strokeWidth={1.25} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-black/70">
                    {member.role} lens
                  </span>
                </div>
                <p className="text-xs text-black/40 mb-2">{member.domain}</p>
                <p className="text-sm text-black/55 leading-relaxed">
                  {member.mandate}
                  {member.frictionWith && (
                    <span className="text-black/50"> ↔ {member.frictionWith}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </Block>
      )}

      {data.scenarios.length > 0 && (
        <Block>
          <Eyebrow>Probable futures</Eyebrow>
          <div className="space-y-3">
            {data.scenarios.map((s) => (
              <div
                key={s.name}
                className={cn(
                  "border border-black/[0.08] p-4",
                  s.isBase && "border-black/[0.14] bg-black/[0.03]"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <span className="text-sm font-medium text-black">
                    {s.name}
                    {s.isBase && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-black/40">
                        base
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-sm text-black/70 tabular-nums shrink-0">{s.probability}</span>
                </div>
                <p className="text-sm text-black/50 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </Block>
      )}

      {data.verdictHtml && (
        <Block>
          <Eyebrow>Institute position</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/80 [&_p]:text-[1.0625rem] [&_p]:leading-[1.75]")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.verdictHtml) }}
          />
          {data.confidence && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-black/45">
              {data.confidence}
            </p>
          )}
        </Block>
      )}

      {data.anchoringBasisHtml && (
        <Block>
          <Eyebrow>Anchoring basis</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/70 [&_p]:text-[1rem] [&_p]:leading-[1.7]")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.anchoringBasisHtml) }}
          />
        </Block>
      )}

      {data.causalChainHtml && (
        <Block>
          <Eyebrow>Causal chain</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/70 [&_p]:text-[1rem] [&_p]:leading-[1.7] [&_.chain-claim]:text-black/85 [&_.chain-evidence]:text-black/60 [&_.chain-warrant]:text-black/60 [&_.chain-label]:font-mono [&_.chain-label]:text-[10px] [&_.chain-label]:uppercase [&_.chain-label]:tracking-[0.12em] [&_.chain-label]:text-black/60 [&_.chain-status]:inline-block [&_.chain-status]:font-mono [&_.chain-status]:text-[9px] [&_.chain-status]:uppercase [&_.chain-status]:tracking-[0.1em] [&_.chain-status]:px-1.5 [&_.chain-status]:py-0.5 [&_.chain-status]:border [&_.chain-status]:border-black/[0.1] [&_.chain-status]:mb-2 [&_.chain-status-present_fact]:border-black/30 [&_.chain-status-present_fact]:text-black/70 [&_.chain-status-active_mechanism]:border-black/20 [&_.chain-status-future_extrapolation]:border-indigo-400/30 [&_.chain-status-future_extrapolation]:text-indigo-400/70")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.causalChainHtml) }}
          />
        </Block>
      )}

      {data.trajectoryHtml && (
        <Block>
          <Eyebrow>Trajectory</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/70 [&_p]:text-[1rem] [&_p]:leading-[1.7]")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.trajectoryHtml) }}
          />
        </Block>
      )}

      {data.keyFindingsHtml && (
        <Block>
          <Eyebrow>Key findings</Eyebrow>
          <ul className="space-y-2">
            {parseListItemsSafe(data.keyFindingsHtml).map((f) => (
              <li key={f} className="text-sm text-black/55 leading-relaxed pl-4 border-l border-black/20">
                {f}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.recommendationsHtml && (
        <Block>
          <Eyebrow>Policy recommendations</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/70 [&_p]:text-[1rem] [&_p]:leading-[1.7] [&_ul]:space-y-1.5 [&_li]:text-sm [&_li]:text-black/60 [&_li]:leading-relaxed")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.recommendationsHtml) }}
          />
        </Block>
      )}

      {data.rejectedAltsHtml && (
        <Block>
          <Eyebrow>Rejected alternatives</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/65 [&_p]:text-[1rem] [&_p]:leading-[1.7] [&_.rejected-scenario]:text-black/80 [&_.rejected-why]:text-black/55 [&_.rejected-risk]:text-black/55 [&_.chain-label]:font-mono [&_.chain-label]:text-[10px] [&_.chain-label]:uppercase [&_.chain-label]:tracking-[0.12em] [&_.chain-label]:text-rose-400/60")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.rejectedAltsHtml) }}
          />
        </Block>
      )}

      {data.signalsHtml && (
        <Block>
          <Eyebrow>Signals to watch</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/65 [&_p]:text-[1rem] [&_p]:leading-[1.7] [&_ul]:space-y-1.5 [&_li]:text-sm [&_li]:text-black/55 [&_.chain-label]:font-mono [&_.chain-label]:text-[10px] [&_.chain-label]:uppercase [&_.chain-label]:tracking-[0.12em] [&_.chain-label]:text-black/60")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.signalsHtml) }}
          />
        </Block>
      )}

      {data.evidenceAssessmentHtml && (
        <Block>
          <Eyebrow>Evidence assessment</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/65 [&_p]:text-[1rem] [&_p]:leading-[1.7] [&_ul]:space-y-1.5 [&_li]:text-sm [&_li]:text-black/55 [&_.chain-label]:font-mono [&_.chain-label]:text-[10px] [&_.chain-label]:uppercase [&_.chain-label]:tracking-[0.12em] [&_.chain-label]:text-black/45 [&_.weakest-link]:text-rose-400/50")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.evidenceAssessmentHtml) }}
          />
        </Block>
      )}

      {data.objections.length > 0 && (
        <Block>
          <Eyebrow>Strongest objections</Eyebrow>
          <ul className="space-y-3">
            {data.objections.map((o) => (
              <li key={o} className="flex gap-3 text-sm text-black/55 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-black/50 shrink-0 mt-0.5" strokeWidth={1.25} />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.whatChangesMind.length > 0 && (
        <Block>
          <Eyebrow>What would change our mind</Eyebrow>
          <ul className="space-y-2">
            {data.whatChangesMind.map((w) => (
              <li key={w} className="text-sm text-black/50 leading-relaxed pl-4 border-l border-black/[0.1]">
                {w}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {data.evidenceTraceHtml && (
        <Block>
          <Eyebrow>Evidence trace</Eyebrow>
          <div
            className={cn(nx.prose, "text-black/65")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.evidenceTraceHtml) }}
          />
        </Block>
      )}

      {data.sourcesHtml && (
        <section className="mt-12 pt-8 border-t border-black/[0.08]">
          <h2 className="font-display text-lg font-semibold text-black mb-4">Sources</h2>
          <div
            className={cn(nx.prose, "text-black/50 text-sm [&_a]:text-black/60")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.sourcesHtml) }}
          />
        </section>
      )}
    </div>
  );
}
