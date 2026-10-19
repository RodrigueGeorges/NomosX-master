"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { getReasoningLenses, type ReasoningLens } from "@/lib/brand/reasoning-lenses";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

/** Desk avatar — the commissioned fresco portrait, initials monogram as fallback. */
function DeskAvatar({ lens, size }: { lens: ReasoningLens; size: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full overflow-hidden border border-black/[0.14] dark:border-white/[0.14] bg-[#050507]"
    >
      {lens.portraitUrl && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lens.portraitUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-mono text-sm font-medium bg-black/[0.04] dark:bg-white/[0.06] text-black/70 dark:text-white/70">
          {lens.initials}
        </div>
      )}
    </div>
  );
}

/**
 * The council — the 22 named research desks rendered on the landing.
 * Each card personifies a desk (Greek monogram, name, domain) and links
 * to its public profile at /researchers/[id] where the desk's signature,
 * priors and live track record are exposed.
 */
export function CouncilRoster({ sectionIndex }: { sectionIndex?: string }) {
  const t = useTranslations("CouncilRoster");
  const lenses = getReasoningLenses();

  return (
    <section className="nx-section-divide relative px-6 sm:px-8 py-20 sm:py-24">
      {sectionIndex && <span className="nx-section-index">{sectionIndex}</span>}

      <div className="max-w-6xl mx-auto">
        <ScrollReveal className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="nx-eyebrow">{t("eyebrow")}</p>
            <h2 className="font-display text-3xl sm:text-4xl mt-3">{t("title")}</h2>
            <p className="mt-3 max-w-xl text-sm text-black/55 dark:text-white/55 leading-relaxed">
              {t("subtitle")}
            </p>
          </div>
          <Link
            href="/researchers"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white transition-colors shrink-0"
          >
            {t("meetDesk")}
            <ArrowRight size={14} />
          </Link>
        </ScrollReveal>

        <ScrollReveal stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {lenses.map((lens) => (
            <Link
              key={lens.id}
              href={`/researchers/${lens.id}`}
              className="group border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] p-4 hover:border-black/25 dark:hover:border-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black"
            >
              <div className="flex items-center gap-3">
                <DeskAvatar lens={lens} size={40} />
                <div className="min-w-0">
                  <p className="font-medium text-sm text-black dark:text-white leading-tight truncate">
                    {lens.deskName}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40 truncate">
                    {lens.domain} · {lens.title}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 dark:text-white/45">
                  {lens.tier === "core" ? t("coreDesk") : lens.tier}
                </span>
                <ArrowRight
                  size={12}
                  className="text-black/25 dark:text-white/25 group-hover:text-black/60 dark:group-hover:text-white/60 group-hover:translate-x-0.5 transition-all"
                />
              </div>
            </Link>
          ))}
        </ScrollReveal>

        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-black/45 dark:text-white/45">
          {t("count", { count: lenses.length })}
        </p>
      </div>
    </section>
  );
}
