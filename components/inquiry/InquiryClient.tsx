"use client";

import React, { useState, useEffect } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Share2, Download, FileText, Tag, FileDown } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import AuthModal from "@/components/AuthModal";
import { PublicPageShell } from "@/components/layout/PublicPageShell";
import { ReaderFeedback } from "@/components/inquiry/ReaderFeedback";
import { PublicationActions } from "@/components/inquiry/PublicationActions";
import { CommissionCTA } from "@/components/inquiry/CommissionCTA";
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
import { CoverArt } from "@/components/signature/InquiryCard";
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
  const t = useTranslations();
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
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
    // Fire-and-forget view count increment (non-blocking)
    fetch(`/api/articles/${inquiry.id}/view`, { method: "POST" }).catch(() => {});
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

  async function downloadExport(path: string, extension: string) {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    setExportSuccess(false);
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Export failed (${response.status}). Please try again.`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nomosx-${inquiry.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}.${extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('Inquiry.exportFailed');
      setExportError(msg);
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  }

  const handleExport = () => downloadExport(`/api/articles/${inquiry.id}/export`, "html");
  const handleExportPdf = () => downloadExport(`/api/articles/${inquiry.id}/export/pdf`, "pdf");
  const handleExportXlsx = () => downloadExport(`/api/articles/${inquiry.id}/export/data?format=xlsx`, "xlsx");

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
      <Script id="jsonld-inquiry" type="application/ld+json" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: JSON.stringify(inquiryJsonLd) }} />
      <PublicPageShell currentPage="inquiries" onSignInClick={() => setShowAuthModal(true)}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 border-b border-black/[0.08]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.push(PUBLIC_ROUTES.archives)}
                className="flex items-center gap-2 text-sm text-black/50 hover:text-black transition-colors"
              >
                <ArrowLeft size={16} />
                {t('Inquiry.backToBriefs')}
              </button>
            </div>
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="p-2 border border-black/[0.08] text-black/50 hover:border-black/25"
              title={t('Inquiry.share')}
              aria-label={t('Inquiry.shareReport')}
            >
              <Share2 size={16} />
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="p-2 border border-black/[0.08] text-black/50 disabled:opacity-40"
              title={t('Inquiry.exportHtml')}
              aria-label={t('Inquiry.exportHtmlAria')}
            >
              {exporting ? (
                <div className={cn("w-4 h-4", nx.spinner, "w-4 h-4")} />
              ) : (
                <Download size={16} />
              )}
            </button>
            <button
              type="button"
              onClick={handleExportXlsx}
              disabled={exporting}
              className="p-2 border border-black/[0.08] text-black/50 disabled:opacity-40 text-[10px] font-mono uppercase tracking-wide"
              title={t('Inquiry.exportXlsx')}
              aria-label={t('Inquiry.exportXlsxAria')}
            >
              xlsx
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting}
              className="p-2 border border-black/[0.08] text-black/50 disabled:opacity-40"
              title={t('Inquiry.exportPdf')}
              aria-label={t('Inquiry.exportPdfAria')}
            >
              {exporting ? (
                <div className={cn("w-4 h-4", nx.spinner, "w-4 h-4")} />
              ) : (
                <FileDown size={16} />
              )}
            </button>
            </div>
            {exportError && (
              <p role="alert" className="absolute top-full right-0 mt-2 text-xs text-rose-400 bg-rose-950/80 px-3 py-1.5 rounded">
                {exportError}
              </p>
            )}
            {exportSuccess && (
              <p role="status" className="absolute top-full right-0 mt-2 text-xs text-emerald-400 bg-emerald-950/80 px-3 py-1.5 rounded">
                {t('Inquiry.exportDownloaded')}
              </p>
            )}
          </div>
          <Breadcrumbs
            items={[
              { label: t('Inquiry.breadcrumbsHome'), href: "/" },
              { label: t('Inquiry.breadcrumbsBriefs'), href: "/archives" },
              { label: inquiry.title.length > 50 ? inquiry.title.slice(0, 50) + "…" : inquiry.title },
            ]}
            className="mt-3"
          />
        </div>

        <PageSection className="py-8">
          <div className="max-w-3xl mx-auto">
            <div className="mb-8 nx-public-surface p-6 sm:p-8 overflow-hidden relative">
              {/* The signature frontispiece — the same generative cover as
                  the piece's archive card, opened full-width. Every
                  publication carries the same visual signature. */}
              <div className="relative h-28 sm:h-40 -mx-6 sm:-mx-8 -mt-6 sm:-mt-8 mb-6 overflow-hidden" aria-hidden="true">
                <CoverArt id={inquiry.id} domain={inquiry.domain} featured />
              </div>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="px-3 py-1 border border-black/40 bg-black/5 text-black text-xs font-medium font-mono uppercase tracking-wider">
                  {format.label}
                </span>
                {format.pages && (
                  <span className="text-black/40 text-xs font-mono">{format.pages}</span>
                )}
                {format.sourceDepth && (
                  <span className="text-black/40 text-xs font-mono">{format.sourceDepth}</span>
                )}
                {format.access && (
                  <span className="px-2 py-0.5 border border-black/20 text-black/50 text-[10px] font-mono uppercase tracking-wider">
                    {format.access}
                  </span>
                )}
              </div>

              <h1 className="font-display text-3xl md:text-4xl font-semibold text-text mb-4">{inquiry.title}</h1>

              {format.description && (
                <p className="text-sm text-black/45 mb-4 leading-relaxed max-w-2xl">{format.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-sm text-black/55 mb-6 font-mono">
                <span>{new Date(inquiry.publishedAt).toLocaleDateString()}</span>
                <span>·</span>
                <span>{t('Inquiry.minRead', { count: inquiry.readTime })}</span>
                <span>·</span>
                <span>{t('Inquiry.sourcesCount', { count: inquiry.sources })}</span>
              </div>

              {/* Correction / Retraction notice */}
              {(inquiry as any).status === "CORRECTED" && (inquiry as any).correctionNotice && (
                <div role="alert" className="mb-6 p-4 border border-amber-500/30 bg-amber-950/20">
                  <p className="text-xs font-mono uppercase tracking-wider text-amber-400 mb-2">{t('Inquiry.correctionNotice')}</p>
                  <p className="text-sm text-amber-100/80">{(inquiry as any).correctionNotice}</p>
                  {(inquiry as any).correctedAt && (
                    <p className="text-xs text-amber-400/60 mt-2 font-mono">
                      {t('Inquiry.correctedOn', { date: new Date((inquiry as any).correctedAt).toLocaleDateString() })}
                    </p>
                  )}
                </div>
              )}
              {(inquiry as any).status === "RETRACTED" && (
                <div role="alert" className="mb-6 p-4 border border-rose-500/40 bg-rose-950/30">
                  <p className="text-xs font-mono uppercase tracking-wider text-rose-400 mb-2">{t('Inquiry.retracted')}</p>
                  <p className="text-sm text-rose-100/80">
                    {t('Inquiry.retractedMsg', { reason: (inquiry as any).retractionReason ? `: ${(inquiry as any).retractionReason}` : "." })}
                  </p>
                  {(inquiry as any).correctionNotice && (
                    <p className="text-sm text-rose-100/60 mt-2">{(inquiry as any).correctionNotice}</p>
                  )}
                </div>
              )}
            </div>

            {inquiry.topics.length > 0 && (
              <div className="mb-8 flex flex-wrap gap-2">
                {inquiry.topics.map((topic) => (
                  <span
                    key={topic}
                    className="flex items-center gap-1 px-3 py-1 border border-black/[0.12] text-black/65 text-xs"
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
                  className="article-content text-black/80 leading-relaxed"
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

            {/* Reader feedback — error reporting + rating */}
            <ReaderFeedback publicationId={inquiry.id} />

            {/* Like / Dislike / Comment / Share */}
            <PublicationActions publicationId={inquiry.id} publicationTitle={inquiry.title} />

            {/* Commission CTA — convert readers into paying clients */}
            <CommissionCTA />

            {related.length > 0 && (
              <div className="mt-16 pt-8 border-t border-black/[0.08]">
                <h3 className="font-display text-lg font-semibold text-text mb-6">{t('Inquiry.relatedBriefs')}</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {related.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => router.push(PUBLIC_ROUTES.inquiry(item.id))}
                      className="w-full text-left nx-public-surface p-5 hover:border-black/20 transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-black/55 uppercase tracking-wider font-mono">
                          {inquiryTypeLabel(item.type)}
                        </span>
                        <span className="text-xs text-black/50 font-mono">{item.readTime} {t('Inquiry.min')}</span>
                      </div>
                      <h4 className="text-sm font-medium text-black/90 mb-1 line-clamp-2 group-hover:text-black transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-xs text-black/55 font-mono">
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
  const t = useTranslations();
  const router = useRouter();
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <FileText className="w-12 h-12 text-black/20 mx-auto mb-4" />
        <h3 className="font-display text-xl font-semibold text-text mb-2">{t('Inquiry.notFoundTitle')}</h3>
        <p className="text-sm text-black/40 mb-6">
          {t('Inquiry.notFoundDesc')}
        </p>
        <button
          type="button"
          onClick={() => router.push(PUBLIC_ROUTES.archives)}
          className={cn(nx.btnGhost, "normal-case tracking-normal font-medium")}
        >
          {t('Inquiry.backToBriefs')}
        </button>
      </div>
    </div>
  );
}
