"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { inquiryUrl } from "@/lib/public-urls";

/**
 * CiteBlock — the institutional citation block.
 * APA text shown inline + BibTeX and RIS downloads for reference
 * managers (Zotero, Mendeley, EndNote import .ris directly).
 */

function slugifyTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function CiteBlock({
  id,
  title,
  publishedAt,
}: {
  id: string;
  title: string;
  publishedAt: string;
}) {
  const t = useTranslations("Inquiry");
  const [copied, setCopied] = useState<string | null>(null);

  const year = new Date(publishedAt).getFullYear();
  const isoDate = new Date(publishedAt).toISOString().slice(0, 10);
  const url = inquiryUrl(id, true);
  const key = `nomosx${year}${slugifyTitle(title).replace(/-/g, "")}`;

  const apa = `NomosX Research Desk. (${year}). ${title}. NomosX. ${url}`;

  const bibtex = `@misc{${key},
  author = {{NomosX Research Desk}},
  title = {${title}},
  year = {${year}},
  publisher = {NomosX},
  howpublished = {\\url{${url}}},
  urldate = {${isoDate}}
}`;

  const ris = `TY  - ELEC
AU  - NomosX Research Desk
TI  - ${title}
PY  - ${year}
DA  - ${isoDate.replace(/-/g, "/")}
PB  - NomosX
UR  - ${url}
Y2  - ${isoDate.replace(/-/g, "/")}
ER  -`;

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const download = (filename: string, text: string, mime: string) => {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  };

  const btnClass =
    "font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-black/20 dark:border-white/20 text-black/60 dark:text-white/60 hover:border-black/50 dark:hover:border-white/40 hover:text-black dark:hover:text-white transition-colors";

  return (
    <div className="mt-12 p-5 border border-black/[0.1] dark:border-white/[0.1] bg-black/[0.02] dark:bg-white/[0.02] print:hidden">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/50 dark:text-white/50">
          {t("citeThis")}
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => copy("apa", apa)} className={btnClass}>
            {copied === "apa" ? t("copied") : `${t("citeApa")} · ${t("copy")}`}
          </button>
          <button type="button" onClick={() => download(`${slugifyTitle(title)}.bib`, bibtex, "application/x-bibtex")} className={btnClass}>
            {t("citeBib")}
          </button>
          <button type="button" onClick={() => download(`${slugifyTitle(title)}.ris`, ris, "application/x-research-info-systems")} className={btnClass}>
            {t("citeRis")}
          </button>
        </div>
      </div>
      <p className="text-xs text-black/60 dark:text-white/60 leading-relaxed font-mono select-all">
        {apa}
      </p>
    </div>
  );
}
