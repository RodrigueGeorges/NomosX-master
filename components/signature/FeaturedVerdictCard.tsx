"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { THINKING_LENSES } from "@/lib/brand/thinking-lenses";
import { StatCounter } from "@/components/ui/StatCounter";

export interface FeaturedVerdictData {
  question: string;
  verdictPrefix: string;
  verdictBody: string;
  confidence: string;
  scenarios: number;
  sources: number;
  objections: number;
  updatedAt: string;
  serialId: string;
  domains?: string[];
  /** Owning desk — resolved from the brief's sign-off or domain. */
  desk?: { id: string; name: string; signed: boolean };
  href?: string;
}

interface FeaturedVerdictCardProps {
  data: FeaturedVerdictData;
  className?: string;
  animate?: boolean;
}

/** Deterministic scatter — each council seat starts displaced, then converges. */
const SEAT_SCATTER: { x: number; y: number; r: number }[] = [
  { x: -52, y: -20, r: -14 },
  { x: 34, y: 18, r: 10 },
  { x: -18, y: 26, r: -8 },
  { x: 48, y: -14, r: 16 },
  { x: -30, y: -26, r: 6 },
  { x: 12, y: 24, r: -18 },
  { x: -44, y: 10, r: 12 },
  { x: 40, y: -24, r: -6 },
  { x: -10, y: -18, r: 20 },
];

/** Seats rendered as hollow rings when the position survived dissents. */
const DISSENT_SEAT_ORDER = [1, 5, 8, 3, 0, 6, 2, 7, 4];

export function FeaturedVerdictCard({ data, className, animate = true }: FeaturedVerdictCardProps) {
  const t = useTranslations();
  const [mounted, setMounted] = useState(!animate);
  const [hoveredSeat, setHoveredSeat] = useState<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  const confidenceNum = Math.min(
    100,
    Math.max(0, parseInt(data.confidence.replace(/[^0-9]/g, ""), 10) || 0)
  );

  const dissentSeats = new Set(
    DISSENT_SEAT_ORDER.slice(0, Math.min(data.objections, THINKING_LENSES.length))
  );

  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, [animate]);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--nx-mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--nx-my", `${e.clientY - rect.top}px`);
  };

  const deliberationLine = t("FeaturedVerdict.deliberationLine", { count: data.objections });
  const futuresLine =
    data.scenarios > 0
      ? t("FeaturedVerdict.futuresWeighed", { count: data.scenarios })
      : null;

  const hovered = hoveredSeat != null ? THINKING_LENSES[hoveredSeat] : null;
  const domainsLine = data.domains?.length ? ` · ${data.domains.slice(0, 3).join(" · ")}` : "";

  const body = (
    <>
      {/* Top row — dossier ref */}
      <div className="flex items-baseline justify-between gap-4 mb-7">
        <p className="nx-eyebrow" style={{ letterSpacing: "0.14em" }}>
          {t("FeaturedVerdict.institutePosition")} · {data.updatedAt}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/30 dark:text-white/30">
          Ref. {data.serialId}
        </p>
      </div>

      {/* The question — headline */}
      <h2 className="font-display text-[1.6rem] sm:text-[1.95rem] font-medium leading-[1.16] tracking-[-0.01em] text-black dark:text-white mb-6">
        {data.question}
      </h2>

      {/* The deliberation — nine seats converge from scatter to order */}
      <div className="mb-6">
        <div
          className="nx-council"
          role="img"
          aria-label={t("FeaturedVerdict.councilAria")}
        >
          {THINKING_LENSES.map((lens, i) => {
            const s = SEAT_SCATTER[i % SEAT_SCATTER.length];
            const dissent = dissentSeats.has(i);
            return (
              <span
                key={lens.id}
                className="nx-council-seat"
                data-dissent={dissent ? "1" : undefined}
                onMouseEnter={() => setHoveredSeat(i)}
                onMouseLeave={() => setHoveredSeat(null)}
                onFocus={() => setHoveredSeat(i)}
                onBlur={() => setHoveredSeat(null)}
                tabIndex={0}
              >
                <span
                  className="nx-council-dot"
                  style={{
                    ["--seat" as string]: lens.colorHex,
                    ["--ox" as string]: `${s.x}px`,
                    ["--oy" as string]: `${s.y}px`,
                    ["--rot" as string]: `${s.r}deg`,
                    ["--d" as string]: `${350 + i * 90}ms`,
                  }}
                />
              </span>
            );
          })}
        </div>
        <div className="relative mt-3 h-[2.4em]">
          <p
            className={cn(
              "font-mono text-[11px] tracking-[0.03em] text-black/45 dark:text-white/45 leading-snug transition-opacity duration-300",
              hovered ? "opacity-0" : "opacity-100"
            )}
          >
            {deliberationLine}
          </p>
          <p
            aria-hidden={!hovered}
            className={cn(
              "absolute inset-0 font-mono text-[11px] tracking-[0.03em] leading-snug transition-opacity duration-300",
              hovered ? "opacity-100" : "opacity-0"
            )}
            style={hovered ? { color: hovered.colorHex } : undefined}
          >
            {hovered ? `${hovered.name} — ${hovered.signatureQuestion}` : "\u00A0"}
          </p>
        </div>
      </div>

      {/* The position — lede */}
      {data.verdictBody && (
        <p className="font-display text-[15px] sm:text-base leading-relaxed text-black/70 dark:text-white/70 mb-7">
          {data.verdictPrefix && (
            <>
              <span className="text-black dark:text-white font-medium">{data.verdictPrefix}</span>
              {" — "}
            </>
          )}
          {data.verdictBody}
        </p>
      )}

      {/* Conviction — the number as object, not a widget */}
      <div className="flex items-end gap-5 py-5 border-t border-black/[0.08] dark:border-white/[0.08] mb-5">
        <p className="font-display text-[3.4rem] leading-[0.82] font-light tabular-nums text-black dark:text-white">
          <StatCounter end={confidenceNum} />
          <span className="text-[1.35rem] text-black/35 dark:text-white/35">%</span>
        </p>
        <div className="pb-1">
          <p className="nx-eyebrow nx-eyebrow--dim mb-1.5" style={{ fontSize: "11px" }}>
            {t("FeaturedVerdict.confidence")}
          </p>
          {futuresLine && (
            <p className="text-[12px] text-black/50 dark:text-white/50 leading-snug">{futuresLine}</p>
          )}
        </div>
      </div>

      {/* Footer — provenance + action */}
      <div className="flex items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.1em] text-black/40 dark:text-white/40">
        <span className="truncate">
          {data.sources} {t("FeaturedVerdict.sources")}
          {domainsLine}
          {data.desk && (
            <>
              {" · "}
              {data.desk.signed
                ? t("FeaturedVerdict.signedBy", { name: data.desk.name })
                : t("FeaturedVerdict.desk", { name: data.desk.name })}
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 text-black/60 dark:text-white/60 shrink-0 group-hover:text-black dark:group-hover:text-white transition-colors">
          {t("FeaturedVerdict.readPosition")}
          <ArrowRight size={12} className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </div>
    </>
  );

  return (
    <article
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={cn(
        "nx-spotlight nx-surface nx-border-flow relative group transition-all duration-700",
        mounted ? "nx-verdict-assembled opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        className
      )}
    >
      {data.href ? (
        <Link href={data.href} className="block p-6 sm:p-8 focus:outline-none">
          {body}
        </Link>
      ) : (
        <div className="p-6 sm:p-8">{body}</div>
      )}
    </article>
  );
}
