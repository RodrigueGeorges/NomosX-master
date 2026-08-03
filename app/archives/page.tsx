"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { InquiryCard } from "@/components/signature";
import { mapBriefToInquiryWithMeta, type BriefLike } from "@/lib/inquiry-mapper";
import type { InquiryDepth } from "@/lib/types/inquiry";
import { nx } from "@/lib/brand/public-ui";
import { cn } from "@/lib/utils";
import { ArrowRight, ChevronLeft, ChevronRight, FileText, Search } from "lucide-react";
import { PUBLIC_ROUTES } from "@/lib/public-urls";

const DEPTH_FILTERS: { id: "all" | InquiryDepth; label: string }[] = [
  { id: "all", label: "All depths" },
  { id: "surface", label: "Surface" },
  { id: "standard", label: "Standard" },
  { id: "deep", label: "Deep" },
  { id: "strategic", label: "Strategic" },
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

export default function ArchivesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [briefs, setBriefs] = useState<BriefLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [depthFilter, setDepthFilter] = useState<(typeof DEPTH_FILTERS)[number]["id"]>("all");
  const [domainFilter, setDomainFilter] = useState<string>(
    searchParams.get("domain") ?? "all"
  );
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const d = searchParams.get("domain");
    if (d) setDomainFilter(d);
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/public/briefs?limit=48")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.briefs?.length) setBriefs(d.briefs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allItems = useMemo(() => {
    return briefs.map((b, i) => {
          const mapped = mapBriefToInquiryWithMeta(b, i);
          return {
            ...mapped,
            trustScore: b.trustScore ?? (parseInt(mapped.verdict?.value ?? "0", 10) || 0),
          };
        });
  }, [briefs]);

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

  useEffect(() => {
    setPage(0);
  }, [depthFilter, domainFilter, search, sortBy]);

  return (
    <>
      <PublicPageShell currentPage="inquiries" onSignInClick={() => setShowAuthModal(true)} particles={0}>
        <PageSection className="pt-16 sm:pt-20">
          <PageHeader
            eyebrow="Published positions"
            title="Brief archive"
            description="Every position we've published — chaos structured into clarity. Filter by depth, domain, and confidence."
          />

          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search briefs…"
                className={cn("w-full pl-10 pr-4 py-2.5", nx.input)}
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className={nx.select}
            >
              <option value="date">Sort: newest</option>
              <option value="trust">Sort: trust score</option>
              <option value="sources">Sort: source count</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {DEPTH_FILTERS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDepthFilter(d.id)}
                className={cn(
                  "px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em]",
                  depthFilter === d.id ? nx.chipActive : nx.chip
                )}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {DOMAIN_FILTERS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDomainFilter(d)}
                className={cn(
                  "px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em]",
                  domainFilter.toLowerCase() === d.toLowerCase() ||
                    (d === "all" && domainFilter === "all")
                    ? "bg-white/10 text-white border border-white/40"
                    : "text-white/50 border border-transparent"
                )}
              >
                {d === "all" ? "All domains" : d}
              </button>
            ))}
          </div>

          {loading && briefs.length === 0 ? (
            <div className="grid md:grid-cols-3 gap-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-52 nx-public-surface animate-pulse"
                />
              ))}
            </div>
          ) : pageItems.length > 0 ? (
            <>
              <p className="font-mono text-[11px] text-white/50 mb-4">
                {filtered.length} briefs · page {page + 1}/{totalPages}
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {pageItems.map((inquiry) => (
                  <InquiryCard
                    key={inquiry.id}
                    inquiry={inquiry}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="p-2 border border-white/[0.08] disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-mono text-xs text-white/55">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-2 border border-white/[0.08] disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="nx-public-surface p-12 text-center max-w-lg mx-auto">
              <div className="w-10 h-10 mx-auto mb-6 border border-white/[0.08] flex items-center justify-center">
                <FileText className="w-5 h-5 text-white/30" strokeWidth={1.25} />
              </div>
              <h3 className="font-display text-lg font-semibold text-text mb-3">
                {search || depthFilter !== "all" || domainFilter !== "all"
                  ? "No briefs match your filters"
                  : "The archive is being assembled"}
              </h3>
              <p className="text-sm text-white/50 leading-relaxed mb-8 max-w-sm mx-auto">
                {search || depthFilter !== "all" || domainFilter !== "all"
                  ? "Try adjusting your filters or search query to explore more briefs."
                  : "Our editorial pipeline is producing new strategic briefs every week. Each one passes through adversarial review before publication."}
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
                    Clear filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push(PUBLIC_ROUTES.studio)}
                  className={cn(nx.btnPrimary, "px-5 py-2.5 normal-case tracking-normal text-xs")}
                >
                  Commission a brief
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
