"use client";

import Link from "next/link";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { nx } from "@/lib/brand/public-ui";
import { BRAND_EMAIL_TAGLINE, BRAND_SOURCES_LINE } from "@/lib/brand/public-copy";
import { sanitizeHtml } from "@/lib/sanitize";
import { getPublicationFormat } from "@/lib/publication-formats";
import { cn } from "@/lib/utils";

type SharedBriefClientProps = {
  brief: {
    id: string;
    title: string | null;
    html: string | null;
    type: string;
    publishedAt: Date | null;
    sourceIds: string[];
    trustScore: number | null;
    wordCount: number | null;
  };
};

export function SharedBriefClient({ brief }: SharedBriefClientProps) {
  const format = getPublicationFormat(brief.type);
  const readTime = Math.max(1, Math.ceil((brief.wordCount ?? 0) / 200));

  return (
    <PublicPageShell particles={0}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-10 pb-6 border-b border-white/[0.08]">
          <span className={nx.eyebrow}>Shared inquiry</span>
          <Link href="/?auth=required" className={cn(nx.btnPrimary, "px-5 py-2.5")}>
            Get access
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="px-3 py-1 border border-white/20 bg-white/[0.04] font-mono text-[10px] uppercase tracking-[0.14em] text-white/70">
              {format.label}
            </span>
            {brief.trustScore != null && (
              <span className="px-2.5 py-1 border border-white/15 bg-white/[0.04] font-mono text-[10px] text-white/60 uppercase tracking-wider">
                Confidence {brief.trustScore}
              </span>
            )}
          </div>
          {brief.title && (
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white mb-3 leading-snug">
              {brief.title}
            </h1>
          )}
          <p className="text-sm text-white/30 flex flex-wrap gap-3 font-mono">
            {brief.publishedAt && (
              <span>
                {new Date(brief.publishedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            )}
            <span>· Agentic Think Tank</span>
            {brief.sourceIds?.length ? <span>· {brief.sourceIds.length} sources</span> : null}
            {readTime > 0 ? <span>· {readTime} min read</span> : null}
          </p>
        </div>

        <div
          className={nx.prose}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(brief.html ?? "") }}
        />

        <div className="mt-16 nx-public-surface p-8 text-center">
          <p className={cn(nx.eyebrow, "mb-3")}>{BRAND_EMAIL_TAGLINE}</p>
          <h2 className={cn(nx.h2, "mb-3")}>Get weekly intelligence briefs like this one.</h2>
          <p className={cn(nx.body, "mb-8 max-w-md mx-auto")}>
            Cross-domain foresight from {BRAND_SOURCES_LINE} — probabilistic verdicts and full traceability.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/#newsletter" className={nx.btnSecondary}>
              Subscribe
            </Link>
            <Link href="/pricing" className={nx.btnPrimary}>
              See pricing
            </Link>
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}
