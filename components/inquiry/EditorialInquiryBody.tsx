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
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35 mb-3">{children}</p>
  );
}

function Block({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mb-10 pb-10 border-b border-white/[0.06] last:border-0 last:pb-0", className)}>
      {children}
    </section>
  );
}

export function EditorialInquiryBody({ data, className }: EditorialInquiryBodyProps) {
  return (
    <div className={cn("max-w-3xl", className)}>
      {(data.collision || data.detectedReason) && (
        <Block>
          <Eyebrow>Detected subject</Eyebrow>
          {data.collision && (
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-white/50 mb-2">{data.collision}</p>
          )}
          {data.detectedReason && (
            <p className="text-sm text-white/60 leading-relaxed mb-3">{data.detectedReason}</p>
          )}
          {data.urgency && (
            <span className="inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-white/40 border border-white/[0.1] px-2 py-1">
              {data.urgency}
            </span>
          )}
        </Block>
      )}

      {data.team.length > 0 && (
        <Block>
          <Eyebrow>Dedicated team</Eyebrow>
          {data.productiveFriction && (
            <p className="text-sm text-white/45 mb-4 leading-relaxed">{data.productiveFriction}</p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {data.team.map((member) => (
              <div
                key={`${member.role}-${member.domain}`}
                className="border border-white/[0.08] bg-white/[0.02] p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-3.5 h-3.5 text-white/35" strokeWidth={1.25} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/70">
                    {member.role} lens
                  </span>
                </div>
                <p className="text-xs text-white/40 mb-2">{member.domain}</p>
                <p className="text-sm text-white/55 leading-relaxed">
                  {member.mandate}
                  {member.frictionWith && (
                    <span className="text-white/30"> ↔ {member.frictionWith}</span>
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
                  "border border-white/[0.08] p-4",
                  s.isBase && "border-white/[0.14] bg-white/[0.03]"
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <span className="text-sm font-medium text-white">
                    {s.name}
                    {s.isBase && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-white/40">
                        base
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-sm text-white/70 tabular-nums shrink-0">{s.probability}</span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </Block>
      )}

      {data.verdictHtml && (
        <Block>
          <Eyebrow>Institute position</Eyebrow>
          <div
            className={cn(nx.prose, "text-white/80 [&_p]:text-[1.0625rem] [&_p]:leading-[1.75]")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.verdictHtml) }}
          />
          {data.confidence && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
              {data.confidence}
            </p>
          )}
        </Block>
      )}

      {data.objections.length > 0 && (
        <Block>
          <Eyebrow>Strongest objections</Eyebrow>
          <ul className="space-y-3">
            {data.objections.map((o) => (
              <li key={o} className="flex gap-3 text-sm text-white/55 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-white/30 shrink-0 mt-0.5" strokeWidth={1.25} />
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
              <li key={w} className="text-sm text-white/50 leading-relaxed pl-4 border-l border-white/[0.1]">
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
            className={cn(nx.prose, "text-white/65")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.evidenceTraceHtml) }}
          />
        </Block>
      )}

      {data.sourcesHtml && (
        <section className="mt-12 pt-8 border-t border-white/[0.08]">
          <h2 className="font-display text-lg font-semibold text-white mb-4">Sources</h2>
          <div
            className={cn(nx.prose, "text-white/50 text-sm [&_a]:text-white/60")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.sourcesHtml) }}
          />
        </section>
      )}
    </div>
  );
}
