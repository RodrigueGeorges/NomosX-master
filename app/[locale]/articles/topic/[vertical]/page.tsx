"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageHeader, PageSection } from "@/components/layout/PageHeader";
import { InquiryCard } from "@/components/signature";
import { mapBriefToInquiryCard, type BriefLike } from "@/lib/inquiry-mapper";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { getVerticalBySlug } from "@/lib/think-tank/verticals";
import { godFieldFor } from "@/lib/brand/god-fields";
import { DomainCover } from "@/components/signature/DomainCover";
import { useLocale } from "next-intl";

// Search keywords per vertical slug — display names/descriptions come from
// the shared think-tank vertical registry (lib/think-tank/verticals).
const VERTICAL_KEYWORDS: Record<string, string> = {
  "eu-policy": "European",
  "climate-industry": "climate",
  "ai-labor": "artificial intelligence",
  geopolitics: "geopolitics",
  "finance-regulation": "finance",
};

export default function TopicPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.vertical as string;
  const locale = useLocale();
  const def = getVerticalBySlug(slug);
  const keyword = VERTICAL_KEYWORDS[slug];
  const vertical = def
    ? {
        name: locale === "fr" ? def.name : def.nameEn,
        icon: def.icon,
        description: def.description,
        keyword: keyword ?? def.nameEn,
      }
    : null;

  const [articles, setArticles] = useState<BriefLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (!vertical) return;
    fetchArticles();
  }, [slug, page]);

  const fetchArticles = async () => {
    if (!vertical) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: page.toString(),
        limit: "12",
        search: vertical.keyword,
      });
      const res = await fetch(`/api/public/briefs?${qs}`);
      const data = await res.json();
      setArticles(data.briefs || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (!vertical) {
    return (
      <PublicPageShell currentPage="inquiries" onSignInClick={() => setShowAuthModal(true)}>
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <p className="text-black/40 dark:text-white/40 mb-4">Domain not found.</p>
          <button
            onClick={() => router.push(PUBLIC_ROUTES.archives)}
            className="text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white text-sm transition-colors"
          >
            ← Back to briefs
          </button>
        </div>
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
      </PublicPageShell>
    );
  }

  return (
    <>
      <PublicPageShell currentPage="inquiries" onSignInClick={() => setShowAuthModal(true)}>
        <PageSection>
          <button
            type="button"
            onClick={() => router.push(PUBLIC_ROUTES.archives)}
            className="flex items-center gap-2 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors text-sm mb-8"
          >
            <ArrowLeft size={14} />
            All briefs
          </button>

          {/* Domain frontispiece — the domain figure in Greek glyphs */}
          {(() => {
            if (!godFieldFor(slug)) return null;
            return (
              <div className="relative mb-6 h-44 sm:h-56 overflow-hidden border border-black/[0.08] dark:border-white/[0.08]">
                <DomainCover domain={slug} animated className="opacity-95" />
              </div>
            );
          })()}

          <PageHeader
            eyebrow={`${vertical.icon} Domain`}
            title={vertical.name}
            description={vertical.description}
          />

          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="w-8 h-8 border border-black/20 border-t-black dark:border-t-white rounded-full animate-spin" />
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-black/20 dark:text-white/20 mx-auto mb-4" />
              <p className="text-black/40 dark:text-white/40">No publications in this domain yet.</p>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                {articles.map((article, i) => (
                  <InquiryCard
                    key={article.id}
                    inquiry={mapBriefToInquiryCard(article, i)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="nx-public-btn-secondary px-4 py-2 text-[11px] disabled:opacity-30"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-sm text-black/50 dark:text-white/50">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="nx-public-btn-secondary px-4 py-2 text-[11px] disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
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
