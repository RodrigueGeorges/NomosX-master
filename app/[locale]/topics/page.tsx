import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { DomainCover } from "@/components/signature/DomainCover";
import { DOMAINS } from "@/lib/brand/domains";
import { archivesDomainUrl } from "@/lib/public-urls";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Policy Areas",
  description:
    "The domains NomosX covers — technology, economics, governance, geopolitics, climate, health, finance and security.",
  alternates: { canonical: "/topics" },
};

export default async function TopicsPage() {
  const locale = await getLocale();
  const t = await getTranslations("Nav");
  const fr = locale === "fr";

  return (
    <PublicPageShell>
      <PageSection className="max-w-5xl">
        <PageHeader
          eyebrow="NomosX"
          title={t("policyAreas")}
          description={
            fr
              ? "Huit domaines, une carte. Chaque publication est produite sous la discipline d'un domaine — chaque domaine a sa figure."
              : "Eight domains, one map. Every publication is produced under a domain's discipline — and every domain has its figure."
          }
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DOMAINS.map((d) => {
            return (
              <Link
                key={d.key}
                href={archivesDomainUrl(d.en)}
                className="group border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] hover:border-black/25 dark:hover:border-white/25 transition-colors"
              >
                <div className="relative h-44 overflow-hidden border-b border-black/[0.08] dark:border-white/[0.08]">
                  <DomainCover domain={d.key} variant="sm" />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <h2 className="font-display text-base font-semibold text-black dark:text-white">
                      {fr ? d.fr : d.en}
                    </h2>
                    <ArrowRight
                      size={13}
                      className="text-black/30 dark:text-white/30 group-hover:text-black dark:group-hover:text-white group-hover:translate-x-0.5 transition-all"
                    />
                  </div>
                  <p className="text-xs text-black/55 dark:text-white/55 leading-relaxed">
                    {fr ? d.descFr : d.descEn}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </PageSection>
    </PublicPageShell>
  );
}
