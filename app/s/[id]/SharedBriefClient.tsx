"use client";

import Link from "next/link";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { sanitizeHtml } from "@/lib/sanitize";
import { getPublicationFormat } from "@/lib/publication-formats";

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
    <PublicPageShell particles={14}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-10 pb-6 border-b border-white/[0.06]">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            Shared inquiry
          </span>
          <Link
            href="/?auth=required"
            className="px-4 py-2 rounded-lg bg-accent hover:brightness-110 text-bg text-sm font-medium transition-colors"
          >
            Get full access
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/20 bg-accent/5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-[11px] text-accent font-semibold tracking-[0.15em] uppercase">
                {format.label}
              </span>
            </div>
            {brief.trustScore != null && (
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                  brief.trustScore >= 85
                    ? "text-emerald-300 border-emerald-500/20 bg-emerald-500/5"
                    : "text-accent border-accent/20 bg-accent/5"
                }`}
              >
                Quality {brief.trustScore}
              </span>
            )}
          </div>
          {brief.title && (
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-text mb-3 leading-snug">
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
            <span>· Autonomous Think Tank</span>
            {brief.sourceIds?.length ? <span>· {brief.sourceIds.length} sources</span> : null}
            {readTime > 0 ? <span>· {readTime} min read</span> : null}
          </p>
        </div>

        <div
          className="prose prose-invert prose-sm sm:prose max-w-none
            prose-headings:font-display prose-headings:text-text
            prose-p:text-white/60 prose-p:leading-relaxed
            prose-a:text-accent prose-a:no-underline hover:prose-a:underline
            prose-strong:text-white/80 prose-blockquote:border-accent/30
            prose-code:text-accent prose-code:bg-accent/10 prose-code:px-1 prose-code:rounded"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(brief.html ?? "") }}
        />

        <div className="mt-16 p-8 rounded-2xl border border-accent/20 bg-bg-elevated text-center">
          <p className="font-mono text-[10px] text-accent/80 uppercase tracking-[0.2em] mb-3">
            The Autonomous Think Tank
          </p>
          <h2 className="font-display text-xl font-semibold text-text mb-3">
            Get weekly intelligence briefs like this one.
          </h2>
          <p className="text-sm text-white/40 mb-6 max-w-md mx-auto">
            NomosX publishes peer-reviewed strategic research autonomously — synthesised from 250M+
            academic sources, validated by 22 PhD-calibrated agents.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/#newsletter"
              className="px-6 py-3 rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-accent/30 text-sm font-medium transition-all"
            >
              Subscribe — free
            </Link>
            <Link
              href="/pricing"
              className="px-6 py-3 rounded-xl bg-accent hover:brightness-110 text-bg text-sm font-semibold transition-all"
            >
              See pricing plans
            </Link>
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}
