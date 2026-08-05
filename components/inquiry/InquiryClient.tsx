"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Share2, Download, FileText, Tag } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { PageSection } from "@/components/layout/PageHeader";
import { ForesightPanel, ForesightPanelSkeleton, ForesightEmptyState } from "@/components/foresight";
import type { ForesightBundle } from "@/lib/foresight";
import { emptyForesight } from "@/lib/foresight";
import { getPublicationFormat } from "@/lib/publication-formats";
import { cn } from "@/lib/utils";
import { nx } from "@/lib/brand/public-ui";
import { inquiryUrl, PUBLIC_ROUTES } from "@/lib/public-urls";
import { EditorialInquiryBody } from "@/components/inquiry/EditorialInquiryBody";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { extractLegacyArticleBody, parseEditorialInquiry } from "@/lib/brand/inquiry-html-parse";
import type { InquiryData, RelatedInquiryData } from "@/lib/queries/public-inquiry";

function inquiryTypeLabel(type: string): string {
  return getPublicationFormat(type as any).label;
}

export function InquiryClient({
  inquiry,
  related,
}: {
  inquiry: InquiryData;
  related: RelatedInquiryData[];
}) {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [foresight, setForesight] = useState<ForesightBundle>(emptyForesight());
  const [foresightLoading, setForesightLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/inquiry/${inquiry.id}/foresight`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.foresight) setForesight(d.foresight);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setForesightLoading(false); });
    return () => { cancelled = true; };
  }, [inquiry.id]);

  async function handleShare() {
    const shareData = {
      title: inquiry.title,
      text: `NomosX brief: ${inquiry.title}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(window.location.href);
    } catch {
      await navigator.clipboard.writeText(window.location.href);
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/articles/${inquiry.id}/export`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nomosx-${inquiry.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  }

  const format = inquiry.format || getPublicationFormat(inquiry.type as any);
  const editorial = parseEditorialInquiry(inquiry.content);

  const inquiryJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: inquiry.title,
    datePublished: inquiry.publishedAt,
    author: { "@type": "Organization", name: "NomosX", url: "https://nomosx.com" },
    publisher: {
      "@type": "Organization",
      name: "NomosX",
      logo: { "@type": "ImageObject", url: "https://nomosx.com/favicon.svg" },
    },
    description: inquiry.content?.substring(0, 200)?.replace(/<[^>]*>/g, "") || inquiry.title,
    mainEntityOfPage: { "@type": "WebPage", "@id": inquiryUrl(inquiry.id, true) },
    keywords: inquiry.topics?.join(", "),
    articleSection: inquiryTypeLabel(inquiry.type),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(inquiryJsonLd) }} />
      <PublicPageShell currentPage="inquiries" onSignInClick={() => setShowAuthModal(true)}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 border-b border-white/[0.08]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.push(PUBLIC_ROUTES.archives)}
                className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
              >
                <ArrowLeft size={16} />
                Back to briefs
              </button>
            </div>
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="p-2 border border-white/[0.08] text-white/50 hover:border-white/25"
              title="Share"
            >
              <Share2 size={16} />
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="p-2 border border-white/[0.08] text-white/50 disabled:opacity-40"
              title="Export"
            >
              {exporting ? (
                <div className={cn("w-4 h-4", nx.spinner, "w-4 h-4")} />
              ) : (
                <Download size={16} />
              )}
            </button>
            </div>
          </div>
          <Breadcrumbs
            items={[
              { label: "NomosX", href: "/" },
              { label: "Briefs", href: "/archives" },
              { label: inquiry.title.length > 50 ? inquiry.title.slice(0, 50) + "…" : inquiry.title },
            ]}
            className="mt-3"
          />
        </div>

        <PageSection className="py-8">
          <div className="max-w-3xl mx-auto">
            <div className="mb-8 nx-public-surface p-6 sm:p-8 overflow-hidden relative">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 border border-white/40 bg-white/5 text-white text-xs font-medium font-mono uppercase tracking-wider">
                  {format.label}
                </span>
              </div>

              <h1 className="font-display text-3xl md:text-4xl font-semibold text-text mb-4">{inquiry.title}</h1>

              <div className="flex flex-wrap items-center gap-4 text-sm text-white/55 mb-6 font-mono">
                <span>{new Date(inquiry.publishedAt).toLocaleDateString()}</span>
                <span>·</span>
                <span>{inquiry.readTime} min read</span>
                <span>·</span>
                <span>{inquiry.sources} sources</span>
              </div>
            </div>

            {inquiry.topics.length > 0 && (
              <div className="mb-8 flex flex-wrap gap-2">
                {inquiry.topics.map((topic) => (
                  <span
                    key={topic}
                    className="flex items-center gap-1 px-3 py-1 border border-white/[0.12] text-white/65 text-xs"
                  >
                    <Tag size={10} />
                    {topic}
                  </span>
                ))}
              </div>
            )}

            {editorial ? (
              <EditorialInquiryBody data={editorial} />
            ) : (
              <div className={nx.prose}>
                <div
                  className="article-content text-white/80 leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(extractLegacyArticleBody(inquiry.content)),
                  }}
                />
              </div>
            )}

            {foresightLoading && <ForesightPanelSkeleton />}

            {!foresightLoading && foresight.available && (
              <div className="mt-12">
                <ForesightPanel foresight={foresight} publicationId={inquiry.id} />
              </div>
            )}

            {!foresightLoading && !foresight.available && (
              <div className="mt-12">
                <ForesightEmptyState />
              </div>
            )}

            {related.length > 0 && (
              <div className="mt-16 pt-8 border-t border-white/[0.08]">
                <h3 className="font-display text-lg font-semibold text-text mb-6">Related briefs</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {related.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => router.push(PUBLIC_ROUTES.inquiry(item.id))}
                      className="w-full text-left nx-public-surface p-5 hover:border-white/20 transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-white/55 uppercase tracking-wider font-mono">
                          {inquiryTypeLabel(item.type)}
                        </span>
                        <span className="text-xs text-white/50 font-mono">{item.readTime} min</span>
                      </div>
                      <h4 className="text-sm font-medium text-white/90 mb-1 line-clamp-2 group-hover:text-white transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-xs text-white/55 font-mono">
                        {new Date(item.publishedAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PageSection>
      </PublicPageShell>

      {showAuthModal && <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />}
    </>
  );
}

export function InquiryNotFound() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <FileText className="w-12 h-12 text-white/20 mx-auto mb-4" />
        <h3 className="font-display text-xl font-semibold text-text mb-2">Brief not found</h3>
        <p className="text-sm text-white/40 mb-6">
          This brief does not exist or is not publicly available.
        </p>
        <button
          type="button"
          onClick={() => router.push(PUBLIC_ROUTES.archives)}
          className={cn(nx.btnGhost, "normal-case tracking-normal font-medium")}
        >
          Back to briefs
        </button>
      </div>
    </div>
  );
}
