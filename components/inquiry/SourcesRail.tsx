"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * SourcesRail — marginal references on wide screens.
 * Collects .apa-ref entries (id ref-N) from the sources section and pins
 * them in the right gutter — the academic sidenote pattern. Clicking an
 * entry scrolls to the full reference. Hidden below 2xl, print-hidden.
 */
export function SourcesRail() {
  const t = useTranslations("Toc");
  const [refs, setRefs] = useState<{ id: string; n: string; text: string }[]>([]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(".apa-ref[id^='ref-'], [id^='src-']")
      );
      if (els.length === 0) return;
      setRefs(
        els.slice(0, 14).map((el, i) => {
          const m = el.id.match(/(\d+)/);
          const text = (el.textContent || "").replace(/\s+/g, " ").trim();
          return {
            id: el.id,
            n: m?.[1] ?? String(i + 1),
            text: text.length > 90 ? text.slice(0, 87) + "…" : text,
          };
        })
      );
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  if (refs.length === 0) return null;

  return (
    <aside
      aria-label={t("sourcesRail")}
      className="hidden 2xl:block fixed right-6 top-40 w-56 font-mono text-[10px] leading-relaxed print:hidden"
    >
      <p className="uppercase tracking-[0.2em] text-black/35 dark:text-white/35 mb-3">
        {t("sourcesRail")}
      </p>
      <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {refs.map((r) => (
          <li key={r.id} className="flex gap-1.5">
            <button
              type="button"
              onClick={() =>
                document.getElementById(r.id)?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              className="text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white shrink-0 transition-colors"
            >
              {r.n}.
            </button>
            <button
              type="button"
              onClick={() =>
                document.getElementById(r.id)?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              className="text-left text-black/45 dark:text-white/45 hover:text-black/80 dark:hover:text-white/80 transition-colors"
            >
              {r.text}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
