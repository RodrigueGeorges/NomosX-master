"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { InquiryCard } from "@/components/signature";
import { mapBriefToInquiryWithMeta, type BriefLike } from "@/lib/inquiry-mapper";
import type { InquiryDepth } from "@/lib/types/inquiry";
import { nx } from "@/lib/brand/public-ui";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, FileText, Search } from "lucide-react";
import { PUBLIC_ROUTES } from "@/lib/public-urls";

const DEPTH_FILTERS: { id: "all" | InquiryDepth; labelKey: string }[] = [
  { id: "all", labelKey: "Archives.allDepths" },
  { id: "surface", labelKey: "Archives.surface" },
  { id: "standard", labelKey: "Archives.standard" },
  { id: "deep", labelKey: "Archives.deep" },
  { id: "strategic", labelKey: "Archives.strategic" },
];

const DOMAIN_FILTERS = [
  "all",
  "Technology",
  "Economics",
  "Governance",
  "Geopolitics",
  "Climate",
  "Health",
  "Finance",
  "Security",
] as const;

type SortKey = "date" | "trust" | "sources";

const PAGE_SIZE = 12;

export function ArchivesClient({ initialBriefs }: { initialBriefs: BriefLike[] }) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [search, setSearch] = useState("");
  const [depthFilter, setDepthFilter] = useState<(typeof DEPTH_FILTERS)[number]["id"]>("all");
  const [domainFilter, setDomainFilter] = useState<string>(
    searchParams.get("domain") ?? "all"
  );
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [page, setPage] = useState(0);

  const allItems = useMemo(() => {
    return initialBriefs.map((b, i) => {
      const mapped = mapBriefToInquiryWithMeta(b, i);
      return {
        ...mapped,
        trustScore: b.trustScore ?? (parseInt(mapped.verdict?.value ?? "0", 10) || 0),
      };
    });
  }, [initialBriefs]);

  const filtered = useMemo(() => {
    return allItems
      .filter((item) => {
        if (depthFilter !== "all" && item.depth !== depthFilter) return false;
        if (
          domainFilter !== "all" &&
          !item.domain.toLowerCase().includes(domainFilter.toLowerCase())
        )
          return false;
        if (search && !item.searchText.includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "trust") return b.trustScore - a.trustScore;
        if (sortBy === "sources") return b.sourceCount - a.sourceCount;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });
  }, [allItems, depthFilter, domainFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      <PublicPageShell currentPage="inquiries" onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <PageSection className="pt-16 sm:pt-20">
          <PageHeader
            eyebrow={t("Archives.eyebrow")}
            title={t("Archives.title")}
            description={t("Archives.description")}
          />

          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/45 dark:text-white/45" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Archives.searchPlaceholder")}
                className={cn("w-full pl-10 pr-4 py-2.5", nx.input)}
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className={nx.select}
            >
              <option value="date">{t("Archives.sortNewest")}</option>
              <option value="trust">{t("Archives.sortTrust")}</option>
              <option value="sources">{t("Archives.sortSources")}</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {DEPTH_FILTERS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { setDepthFilter(d.id); setPage(0); }}
                className={cn(
                  "px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em]",
                  depthFilter === d.id ? nx.chipActive : nx.chip
                )}
              >
                {t(d.labelKey)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {DOMAIN_FILTERS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setDomainFilter(d); setPage(0); }}
                className={cn(
                  "px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em]",
                  domainFilter.toLowerCase() === d.toLowerCase() ||
                    (d === "all" && domainFilter === "all")
                    ? "bg-black/10 dark:bg-white/10 text-black dark:text-white border border-black/40 dark:border-white/40"
                    : "text-black/50 dark:text-white/50 border border-transparent"
                )}
              >
                {d === "all" ? t("Archives.allDomains") : d}
              </button>
            ))}
          </div>

          {pageItems.length > 0 ? (
            <>
              <p className="font-mono text-[11px] text-black/50 dark:text-white/50 mb-4">
                {t("Archives.briefsCount", { count: filtered.length, current: page + 1, total: totalPages })}
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {pageItems.map((inquiry, i) => (
                  <InquiryCard
                    key={inquiry.id}
                    inquiry={inquiry}
                    featured={page === 0 && i === 0}
                    className={page === 0 && i === 0 ? "md:col-span-2 lg:col-span-2" : undefined}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-2 border border-black/[0.08] dark:border-white/[0.08] disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-mono text-xs text-black/55 dark:text-white/55">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-2 border border-black/[0.08] dark:border-white/[0.08] disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="nx-public-surface p-12 text-center max-w-lg mx-auto">
              <div className="w-10 h-10 mx-auto mb-6 border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-center">
                <FileText className="w-5 h-5 text-black/30 dark:text-white/30" strokeWidth={1.25} />
              </div>
              <h3 className="font-display text-lg font-semibold text-text mb-3">
                {search || depthFilter !== "all" || domainFilter !== "all"
                  ? t("Archives.noMatchTitle")
                  : t("Archives.emptyTitle")}
              </h3>
              <p className="text-sm text-black/50 dark:text-white/50 leading-relaxed mb-8 max-w-sm mx-auto">
                {search || depthFilter !== "all" || domainFilter !== "all"
                  ? t("Archives.noMatchDesc")
                  : t("Archives.emptyDesc")}
              </p>
              <div className="flex items-center justify-center gap-3">
                {(search || depthFilter !== "all" || domainFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setDepthFilter("all");
                      setDomainFilter("all");
                    }}
                    className={cn(nx.btnGhost, "px-5 py-2.5 normal-case tracking-normal text-xs")}
                  >
                    {t("Archives.clearFilters")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push(PUBLIC_ROUTES.studio)}
                  className={cn(nx.btnPrimary, "px-5 py-2.5 normal-case tracking-normal text-xs")}
                >
                  {t("Archives.commissionStudy")}
                </button>
              </div>
            </div>
          )}
        </PageSection>
      </PublicPageShell>

      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => {
            setShowAuthModal(false);
            router.push("/archives");
          }}
        />
      )}
    </>
  );
}
