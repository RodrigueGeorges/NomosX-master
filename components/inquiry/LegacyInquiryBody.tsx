"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { sanitizeHtml } from "@/lib/sanitize";
import { cn } from "@/lib/utils";
import { nx } from "@/lib/brand/public-ui";
import { Link2 } from "lucide-react";

/**
 * LegacyInquiryBody — editorial chrome for pre-V2 publication HTML.
 *
 * Older Signal Briefs / Update Notes don't carry nx-block sections, so
 * parseEditorialInquiry returns null. We still give them the institutional
 * treatment: the raw HTML is split on <h2> boundaries into data-toc
 * sections (same contract as EditorialInquiryBody → InquiryToc scroll-spy
 * works identically), the strongest opening sentence is lifted as a pull
 * quote, and the Sources section gets its own anchor.
 */

interface LegacySection {
  id: string;
  label: string;
  html: string;
  isSources: boolean;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

const SOURCE_HEADING = /^(sources?|references|références|bibliography|bibliographie)/i;

/** Lift boilerplate elements the frontispiece already renders (h1, hero image). */
function stripBoilerplate(html: string): string {
  return html
    .replace(/<div[^>]*class="[^"]*hero-image[^"]*"[^>]*>[\s\S]*?<\/div>/i, "")
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "");
}

/** Split on <h2> boundaries — h3 stays inside its parent section. */
function splitSections(body: string): { intro: string; sections: LegacySection[] } {
  const parts = body.split(/(?=<h2[^>]*>)/i);
  const sections: LegacySection[] = [];
  let intro = "";
  const usedIds = new Set<string>();

  for (const part of parts) {
    const m = part.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!m) {
      intro += part;
      continue;
    }
    const label = m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    const isSources = SOURCE_HEADING.test(label);
    let id = slugify(label) || "section";
    while (usedIds.has(id)) id = `${id}-x`;
    usedIds.add(id);
    sections.push({
      id: isSources ? "sources" : id,
      label,
      html: part.slice(m[0].length),
      isSources,
    });
  }
  return { intro, sections };
}

/** Strongest sentence of the opening — lifted as a pull quote. */
function extractPullQuote(html: string): string | null {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\[SRC-\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = text.match(/[^.!?]+[.!?]/g) ?? [];
  return sentences.map((s) => s.trim()).find((s) => s.length >= 80 && s.length <= 300) ?? null;
}

function SectionEyebrow({ label, anchorId }: { label: string; anchorId: string }) {
  const t = useTranslations("Inquiry");
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#${anchorId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
    history.replaceState(null, "", `#${anchorId}`);
  };

  return (
    <div className="group/eyebrow flex items-center gap-1.5 mb-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 dark:text-white/50">{label}</p>
      <button
        type="button"
        onClick={copyLink}
        title={copied ? t("sectionLinkCopied") : t("copySectionLink")}
        aria-label={t("copySectionLink")}
        className="opacity-0 group-hover/eyebrow:opacity-100 focus:opacity-100 transition-opacity text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
      >
        {copied ? <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">§</span> : <Link2 size={11} strokeWidth={1.5} />}
      </button>
    </div>
  );
}

export function LegacyInquiryBody({ html, className }: { html: string; className?: string }) {
  const t = useTranslations("Editorial");
  const { intro, sections } = splitSections(stripBoilerplate(html));
  const pullQuote = extractPullQuote(intro || sections[0]?.html || "");
  const hasStructure = sections.length > 0;

  if (!hasStructure) {
    return (
      <div className={cn("max-w-3xl", className)}>
        <div
          className={cn(nx.prose, "article-content text-black/80 dark:text-white/80 leading-relaxed")}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(intro || html) }}
        />
      </div>
    );
  }

  return (
    <div className={cn("max-w-3xl", className)}>
      {intro.trim() && (
        <section
          id="overview"
          data-toc={t("overview")}
          className="mb-10 pb-10 border-b border-black/[0.08] dark:border-white/[0.08] scroll-mt-24"
        >
          <SectionEyebrow label={t("overview")} anchorId="overview" />
          <div
            className={cn(nx.prose, "article-content text-black/80 dark:text-white/80 leading-relaxed")}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(intro) }}
          />
        </section>
      )}

      {pullQuote && sections.length > 0 && (
        <blockquote className="my-10 -mx-2 px-6 py-6 border-y border-black/[0.1] dark:border-white/[0.1]">
          <p className="font-display text-xl md:text-2xl leading-snug text-black dark:text-white max-w-2xl">
            &ldquo;{pullQuote}&rdquo;
          </p>
          <cite className="mt-3 block font-mono text-[10px] uppercase tracking-[0.18em] text-black/40 dark:text-white/40 not-italic">
            — {t("researchDesk")}
          </cite>
        </blockquote>
      )}

      {sections.map((s) => (
        <section
          key={s.id}
          id={s.id}
          data-toc={s.label}
          className={cn(
            "mb-10 pb-10 border-b border-black/[0.08] dark:border-white/[0.08] last:border-0 last:pb-0 scroll-mt-24",
            s.isSources && "mt-12 pt-8"
          )}
        >
          <SectionEyebrow label={s.label} anchorId={s.id} />
          <div
            className={cn(
              nx.prose,
              "article-content",
              s.isSources
                ? "text-black/60 dark:text-white/60 text-sm [&_a]:text-black/60 [&_a]:dark:text-white/60"
                : "text-black/80 dark:text-white/80 leading-relaxed"
            )}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(s.html) }}
          />
        </section>
      ))}
    </div>
  );
}
