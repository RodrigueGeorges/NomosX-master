"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * ReadingRoom — the institute's sources, presented like a masthead.
 * Two counter-scrolling serif rows. Credibility you feel, not debug.
 */

type SourceEntry = { name: string; cat: string };

const ROW_A: SourceEntry[] = [
  { name: "Reuters", cat: "wire" },
  { name: "OpenAlex", cat: "scholarly" },
  { name: "IMF", cat: "institution" },
  { name: "CIA FOIA", cat: "archive" },
  { name: "Brookings", cat: "institution" },
  { name: "arXiv", cat: "scholarly" },
  { name: "UN Security Council", cat: "institution" },
  { name: "Le Monde", cat: "press" },
  { name: "RAND", cat: "institution" },
  { name: "World Bank", cat: "institution" },
  { name: "PubMed", cat: "scholarly" },
  { name: "The Guardian", cat: "press" },
];

const ROW_B: SourceEntry[] = [
  { name: "NARA", cat: "archive" },
  { name: "OECD", cat: "institution" },
  { name: "Kyiv Independent", cat: "press" },
  { name: "Crossref", cat: "scholarly" },
  { name: "NATO", cat: "institution" },
  { name: "SSRN", cat: "scholarly" },
  { name: "ECB", cat: "institution" },
  { name: "ReliefWeb", cat: "wire" },
  { name: "WTO", cat: "institution" },
  { name: "Google Patents", cat: "archive" },
  { name: "Lowy Institute", cat: "institution" },
  { name: "Crunchbase", cat: "market" },
];

function MarqueeRow({ items, reverse = false, duration }: { items: SourceEntry[]; reverse?: boolean; duration: string }) {
  return (
    <div className="nx-marquee-pause overflow-hidden nx-reading-room-fade">
      <div
        className={cn("flex whitespace-nowrap items-baseline w-max", reverse ? "animate-marquee-reverse" : "animate-marquee")}
        style={{ animationDuration: duration }}
      >
        {[...items, ...items].map((s, i) => (
          <span key={`${s.name}-${i}`} className="flex items-baseline px-6 sm:px-8">
            <span className="font-display text-xl sm:text-2xl font-light text-black/75 tracking-tight">
              {s.name}
            </span>
            <span className="ml-3 font-mono text-[9px] uppercase tracking-[0.2em] text-black/30">
              {s.cat}
            </span>
            <span className="ml-12 text-black/[0.12] text-xs select-none" aria-hidden>◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ReadingRoom({ className }: { className?: string }) {
  const t = useTranslations("ReadingRoom");

  return (
    <section className={cn("nx-section-divide relative py-14 sm:py-16 overflow-hidden", className)}>
      <div className="px-6 sm:px-8">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <p className="nx-eyebrow mb-4 justify-center">{t("eyebrow")}</p>
          <p className="font-display text-lg sm:text-xl font-light text-black/70 leading-relaxed">
            {t("line")}
          </p>
        </div>
      </div>
      <div className="space-y-6 sm:space-y-7">
        <MarqueeRow items={ROW_A} duration="70s" />
        <MarqueeRow items={ROW_B} reverse duration="85s" />
      </div>
      <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-black/35 mt-8 px-6">
        {t("footnote")}
      </p>
    </section>
  );
}
