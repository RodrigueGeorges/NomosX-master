"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * InquiryToc — floating table of contents for long-form publications.
 * Discovers sections marked data-toc in the article body, scroll-spies
 * via IntersectionObserver, renders in the left gutter on xl+ screens.
 */
export function InquiryToc() {
  const t = useTranslations("Toc");
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-toc]"));
    if (els.length < 3) return;
    const raf = requestAnimationFrame(() =>
      setItems(
        els.map((el) => ({ id: el.id, label: el.dataset.toc ?? "" })).filter((i) => i.id)
      )
    );

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -65% 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, []);

  if (items.length < 3) return null;

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      {/* Wide screens — sticky left rail */}
      <nav
        aria-label="Contents"
        className="hidden xl:block fixed left-6 top-40 w-52 font-mono text-[11px] leading-relaxed print:hidden"
      >
        <p className="uppercase tracking-[0.2em] text-black/35 dark:text-white/35 mb-3">
          {t("title")}
        </p>
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => scrollTo(i.id)}
                className={
                  active === i.id
                    ? "text-black dark:text-white border-l-2 border-black dark:border-white pl-2 -ml-px"
                    : "text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 border-l border-black/10 dark:border-white/10 pl-2 transition-colors"
                }
              >
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile / tablet — collapsible contents chip, bottom-right */}
      <details className="xl:hidden fixed bottom-4 right-4 z-40 font-mono text-[11px] print:hidden group">
        <summary className="list-none cursor-pointer px-3 py-2 border border-black/[0.15] dark:border-white/[0.15] bg-white/95 dark:bg-black/95 backdrop-blur uppercase tracking-[0.14em] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors">
          {t("title")}
        </summary>
        <nav
          aria-label="Contents"
          className="absolute bottom-full right-0 mb-2 w-56 max-h-[50vh] overflow-y-auto border border-black/[0.15] dark:border-white/[0.15] bg-white dark:bg-black p-3 shadow-lg"
        >
          <ul className="space-y-1.5">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={(e) => {
                    scrollTo(i.id);
                    (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                  }}
                  className={
                    active === i.id
                      ? "text-black dark:text-white border-l-2 border-black dark:border-white pl-2 -ml-px"
                      : "text-black/40 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 border-l border-black/10 dark:border-white/10 pl-2 transition-colors"
                  }
                >
                  {i.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </details>
    </>
  );
}
