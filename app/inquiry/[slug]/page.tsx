"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { extractLegacyArticleBody, parseEditorialInquiry } from "@/lib/brand/inquiry-html-parse";
type InquiryType =
  | "RESEARCH_BRIEF"
  | "UPDATE_NOTE"
  | "DATA_NOTE"
  | "POLICY_NOTE"
  | "DOSSIER"
  | "EXECUTIVE_BRIEF"
  | "STRATEGIC_REPORT"
  | "SUMMARY_BRIEF";

function inquiryTypeLabel(type: InquiryType): string {
  return getPublicationFormat(type).label;
}

interface Inquiry {
  id: string;
  title: string;
  content: string;
  type: InquiryType;
  publishedAt: string;
  readTime: number;
  sources: number;
  topics: string[];
  author?: string;
  trustScore?: number;
  format?: ReturnType<typeof getPublicationFormat>;
}

interface RelatedInquiry {
  id: string;
  title: string;
  type: InquiryType;
  publishedAt: string;
  readTime: number;
}

export default function InquiryPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [related, setRelated] = useState<RelatedInquiry[]>([]);
  const [foresight, setForesight] = useState<ForesightBundle>(emptyForesight());
  const [foresightLoading, setForesightLoading] = useState(true);
  const [loading, setLoading] = useState(true);  const [showAuthModal, setShowAuthModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (slug) fetchInquiry(slug);
  }, [slug]);

  async function fetchInquiry(id: string) {
    setLoading(true);
    setForesightLoading(true);
    try {
      const [articleRes, foresightRes] = await Promise.all([
        fetch(`/api/articles/${id}`),
        fetch(`/api/inquiry/${id}/foresight`),
      ]);

      if (articleRes.ok) {
        const data = await articleRes.json();
        setInquiry(data.article);
        setRelated(data.relatedArticles || []);
      } else {
        setShowAuthModal(true);
      }

      if (foresightRes.ok) {
        const fData = await foresightRes.json();
        setForesight(fData.foresight ?? emptyForesight());
      }
    } catch (error) {
      console.error("Failed to fetch inquiry:", error);
    } finally {
      setLoading(false);
      setForesightLoading(false);
    }
  }
  async function handleShare() {
    if (!inquiry) return;
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
    if (!inquiry || exporting) return;
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

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/40">
          <div className={cn("w-5 h-5", nx.spinner, "w-5 h-5")} />
          <span>Loading brief...</span>
        </div>
      </div>
    );
  }

  if (!inquiry) {
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

  const format = inquiry.format || getPublicationFormat(inquiry.type);
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 border-b border-white/[0.08] flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push(PUBLIC_ROUTES.archives)}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            Back to briefs
          </button>
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
                {inquiry.author && (
                  <>
                    <span>·</span>
                    <span>{inquiry.author}</span>
                  </>
                )}
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

            {!foresightLoading && foresight.available && inquiry && (
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
