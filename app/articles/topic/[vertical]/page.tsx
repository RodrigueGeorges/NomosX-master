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

const VERTICALS: Record<
  string,
  { name: string; icon: string; description: string; keyword: string }
> = {
  "eu-policy": {
    name: "EU Policy",
    icon: "🇪🇺",
    description: "EU regulations, directives, and institutional policy shifts.",
    keyword: "European",
  },
  "climate-industry": {
    name: "Climate & Industry",
    icon: "🌍",
    description: "Energy transition, decarbonization, carbon pricing mechanisms.",
    keyword: "climate",
  },
  "ai-labor": {
    name: "AI & Labor",
    icon: "🤖",
    description: "AI impact on employment, automation, and future skills.",
    keyword: "artificial intelligence",
  },
  geopolitics: {
    name: "Geopolitics",
    icon: "🌐",
    description: "International relations, security, diplomacy.",
    keyword: "geopolitics",
  },
  "finance-regulation": {
    name: "Finance & Regulation",
    icon: "💹",
    description: "Financial markets, banking regulation, crypto-assets.",
    keyword: "finance",
  },
};

export default function TopicPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.vertical as string;
  const vertical = VERTICALS[slug];

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
          <p className="text-white/40 mb-4">Domain not found.</p>
          <button
            onClick={() => router.push(PUBLIC_ROUTES.archives)}
            className="text-white/60 hover:text-white text-sm transition-colors"
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
            className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm mb-8"
          >
            <ArrowLeft size={14} />
            All briefs
          </button>

          <PageHeader
            eyebrow={`${vertical.icon} Domain`}
            title={vertical.name}
            description={vertical.description}
          />

          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="w-8 h-8 border border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/40">No publications in this domain yet.</p>
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
                  <span className="font-mono text-sm text-white/50">
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
