"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Home } from "lucide-react";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { NomosXLogo } from "@/components/brand/NomosXLogo";

export default function LocaleNotFound() {
  const router = useRouter();
  const t = useTranslations();

  return (
    <PublicPageShell particles={0} contentClassName="flex items-center justify-center px-4">
      <div className="text-center max-w-md py-24">
        <div className="flex justify-center mb-8">
          <NomosXLogo variant="symbol" size={40} />
        </div>
        <p className="font-mono text-8xl font-light text-black/20 dark:text-white/20 tabular-nums mb-4">404</p>
        <h1 className="font-display text-2xl font-semibold mb-3">{t("NotFound.title")}</h1>
        <p className="text-sm text-black/45 dark:text-white/45 mb-8 leading-relaxed">
          {t("NotFound.description")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-black text-bg text-sm font-semibold hover:bg-black/90 dark:hover:bg-white/90"
          >
            <Home size={16} />
            {t("NotFound.backToHome")}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-black/[0.10] dark:border-white/[0.10] text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
          >
            <ArrowLeft size={16} />
            {t("NotFound.previousPage")}
          </button>
        </div>
      </div>
    </PublicPageShell>
  );
}
