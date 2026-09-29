"use client";

import { useEffect, useRef, useState } from "react";

/**
 * CitationTooltip — hovering a [SRC-n]/[ref-n] inline citation shows the
 * full source entry in a floating card, no scroll to the bibliography.
 * Delegated listeners, zero markup in the article HTML.
 */
export function CitationTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number>(0);

  useEffect(() => {
    const show = (anchor: HTMLElement) => {
      const href = anchor.getAttribute("href") || "";
      const target = href.startsWith("#") && document.getElementById(href.slice(1));
      if (!target) return;
      const text = target.textContent?.replace(/\s+/g, " ").trim();
      if (!text) return;
      window.clearTimeout(hideTimer.current);
      const r = anchor.getBoundingClientRect();
      setTip({
        x: Math.min(r.left, window.innerWidth - 340),
        y: r.bottom + 6,
        text,
      });
    };

    const over = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href^='#src-'], a[href^='#ref-']") as HTMLElement | null;
      if (a) show(a);
    };
    const out = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href^='#src-'], a[href^='#ref-']");
      if (a) hideTimer.current = window.setTimeout(() => setTip(null), 160);
    };
    const click = () => setTip(null);

    const beforePrint = () => {
      document.querySelectorAll("details").forEach((d) => (d.open = true));
    };

    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("click", click);
    window.addEventListener("beforeprint", beforePrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("click", click);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      ref={elRef}
      role="tooltip"
      onMouseEnter={() => window.clearTimeout(hideTimer.current)}
      onMouseLeave={() => setTip(null)}
      className="fixed z-50 max-w-xs p-3 bg-white dark:bg-[#141412] border border-black/[0.12] dark:border-white/[0.12] shadow-lg text-[11px] leading-relaxed text-black/70 dark:text-white/70 print:hidden"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  );
}
