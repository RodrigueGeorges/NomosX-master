"use client";

import React, { useState, useEffect } from "react";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Share2, Download, FileText, Tag, FileDown, Linkedin, Twitter, Volume2, VolumeX } from "lucide-react";
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
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { Link } from "@/i18n/navigation";
import { EditorialInquiryBody } from "@/components/inquiry/EditorialInquiryBody";
import { LegacyInquiryBody } from "@/components/inquiry/LegacyInquiryBody";
import { InquiryToc } from "@/components/inquiry/InquiryToc";
import { CitationTooltip } from "@/components/inquiry/CitationTooltip";
import { SourcesRail } from "@/components/inquiry/SourcesRail";
import { CiteBlock } from "@/components/inquiry/CiteBlock";
import { ReadingProgress } from "@/components/inquiry/ReadingProgress";
import { NewsletterCta } from "@/components/inquiry/NewsletterCta";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

import { domainCoverCredit } from "@/lib/brand/domain-figures";
import { DomainCover } from "@/components/signature/DomainCover";
import { resolveDomainKey } from "@/lib/brand/god-fields";
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

  function shareOn(network: "linkedin" | "x") {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(inquiry.title);
    const shareUrl =
      network === "linkedin"
        ? `https://www.linkedin.com/sharing/share-offsite/?url=${url}`
        : `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer,width=640,height=560");
  }

  const [listening, setListening] = useState(false);
  function toggleListen() {
    if (listening) {
      window.speechSynthesis?.cancel();
      setListening(false);
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) return;
    const articleEl = document.querySelector("main");
    const text = `${inquiry.title}. ${articleEl?.textContent?.replace(/\s+/g, " ").slice(0, 32000) ?? ""}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onend = () => setListening(false);
    utterance.onerror = () => setListening(false);
    synth.cancel();
    synth.speak(utterance);
    setListening(true);
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

  return (
    <>
      <PublicPageShell currentPage="inquiries" onSignInClick={() => setShowAuthModal(true)}>
        <ReadingProgress />
        <InquiryToc />
        <SourcesRail />
        <CitationTooltip />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 border-b border-black/[0.08] dark:border-white/[0.08] print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => router.push(PUBLIC_ROUTES.archives)}
                className="flex items-center gap-2 text-sm text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
              >
                <ArrowLeft size={16} />
                {t('Inquiry.backToBriefs')}
              </button>
            </div>
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="p-2 border border-black/[0.08] dark:border-white/[0.08] text-black/50 dark:text-white/50 hover:border-black/25 dark:hover:border-white/25"
              title={t('Inquiry.share')}
              aria-label={t('Inquiry.shareReport')}
            >
              <Share2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => shareOn("linkedin")}
              className="p-2 border border-black/[0.08] dark:border-white/[0.08] text-black/50 dark:text-white/50 hover:border-black/25 dark:hover:border-white/25"
              title={t('Inquiry.shareLinkedIn')}
              aria-label={t('Inquiry.shareLinkedIn')}
            >
              <Linkedin size={16} />
            </button>
            <button
              type="button"
              onClick={() => shareOn("x")}
              className="p-2 border border-black/[0.08] dark:border-white/[0.08] text-black/50 dark:text-white/50 hover:border-black/25 dark:hover:border-white/25"
              title={t('Inquiry.shareX')}
              aria-label={t('Inquiry.shareX')}
            >
              <Twitter size={16} />
            </button>
            <button
              type="button"
              onClick={toggleListen}
              className="p-2 border border-black/[0.08] dark:border-white/[0.08] text-black/50 dark:text-white/50 hover:border-black/25 dark:hover:border-white/25"
              title={listening ? t('Inquiry.listenStop') : t('Inquiry.listen')}
              aria-label={listening ? t('Inquiry.listenStop') : t('Inquiry.listen')}
            >
              {listening ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="p-2 border border-black/[0.08] dark:border-white/[0.08] text-black/50 dark:text-white/50 disabled:opacity-40"
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
              className="p-2 border border-black/[0.08] dark:border-white/[0.08] text-black/50 dark:text-white/50 disabled:opacity-40 text-[10px] font-mono uppercase tracking-wide"
              title={t('Inquiry.exportXlsx')}
              aria-label={t('Inquiry.exportXlsxAria')}
            >
              xlsx
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting}
              className="p-2 border border-black/[0.08] dark:border-white/[0.08] text-black/50 dark:text-white/50 disabled:opacity-40"
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
              {/* Frontispiece — the publication's commissioned artwork when it
                  exists; otherwise the domain's identity plate with credit. */}
              <figure className="-mx-6 sm:-mx-8 -mt-6 sm:-mt-8 mb-6">
                {(() => {
                  const commissioned = inquiry.heroImageUrl || editorial?.heroImageUrl || null;
                  if (commissioned) {
                    return (
                      <div className="relative w-full aspect-[16/9] max-h-[420px] overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={commissioned}
                          alt=""
                          className="h-full w-full object-cover filter brightness-[0.92] dark:brightness-[0.80] contrast-[1.05]"
                        />
                      </div>
                    );
                  }
                  const key = inquiry.verticalSlug ?? inquiry.domain;
                  const meta =
                    domainCoverCredit(key) ??
                    inquiry.topics?.map((t) => domainCoverCredit(t)).find(Boolean);
                  return (
                    <>
                      <div className="relative w-full h-44 sm:h-60 overflow-hidden">
                        <DomainCover domain={key} domains={inquiry.topics} animated className="opacity-95" />
                      </div>
                      {meta && (
                        <figcaption className="mt-2 px-6 sm:px-8 font-mono text-[10px] uppercase tracking-[0.14em] text-black/40 dark:text-white/40">
                          {meta.title} — {meta.credit}
                        </figcaption>
                      )}
                    </>
                  );
                })()}
              </figure>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="px-3 py-1 border border-black/40 dark:border-white/40 bg-black/5 dark:bg-white/5 text-black dark:text-white text-xs font-medium font-mono uppercase tracking-wider">
                  {format.label}
                </span>
                {inquiry.verticalSlug && inquiry.domain && inquiry.domain !== "general" && (
                  <button
                    type="button"
                    onClick={() => router.push(`/articles/topic/${inquiry.verticalSlug}`)}
                    className="px-3 py-1 border border-black/20 dark:border-white/20 text-black/60 dark:text-white/60 text-xs font-mono uppercase tracking-wider hover:border-black/50 dark:hover:border-white/40 hover:text-black dark:hover:text-white transition-colors"
                  >
                    {inquiry.domain}
                  </button>
                )}
                {format.pages && (
                  <span className="text-black/40 dark:text-white/40 text-xs font-mono">{format.pages}</span>
                )}
                {format.sourceDepth && (
                  <span className="text-black/40 dark:text-white/40 text-xs font-mono">{format.sourceDepth}</span>
                )}
                {format.access && (
                  <span className="px-2 py-0.5 border border-black/20 dark:border-white/20 text-black/50 dark:text-white/50 text-[10px] font-mono uppercase tracking-wider">
                    {format.access}
                  </span>
                )}
              </div>

              <h1 className="font-display text-3xl md:text-4xl font-semibold text-black dark:text-white mb-4">{inquiry.title}</h1>

              {editorial?.lede ? (
                <p className="text-lg text-black/70 dark:text-white/70 mb-4 leading-relaxed max-w-2xl font-medium">{editorial.lede}</p>
              ) : format.description ? (
                <p className="text-sm text-black/50 dark:text-white/50 mb-4 leading-relaxed max-w-2xl">{format.description}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-black/60 dark:text-white/60 mb-6 font-mono">
                {inquiry.desk ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/researchers/${inquiry.desk!.id}`)}
                    className="inline-flex items-center gap-1.5 hover:text-black dark:hover:text-white transition-colors underline-offset-4 hover:underline"
                  >
                    <span
                      className="inline-flex w-4 h-4 rounded-full items-center justify-center font-mono text-[8px] leading-none"
                      style={{ color: inquiry.desk.colorHex, backgroundColor: `${inquiry.desk.colorHex}18` }}
                    >
                      {inquiry.desk.initials}
                    </span>
                    {t('Inquiry.bylineDesk', { name: inquiry.desk.name })}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/desk/${resolveDomainKey(inquiry.verticalSlug ?? inquiry.domain) ?? ""}`.replace(/\/$/, ""))
                    }
                    className="hover:text-black dark:hover:text-white transition-colors underline-offset-4 hover:underline"
                  >
                    {t('Inquiry.byline')}
                  </button>
                )}
                {inquiry.desk?.signedBy && (
                  <span className="text-black/35 dark:text-white/35">
                    {t('Inquiry.signedBy', { name: inquiry.desk.signedBy })}
                  </span>
                )}
                <span>·</span>
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
                  <Link
                    href={PUBLIC_ROUTES.corrections}
                    className="inline-block mt-2 text-[11px] font-mono uppercase tracking-wider text-amber-400/70 hover:text-amber-300 underline underline-offset-4 transition-colors"
                  >
                    {t('Inquiry.correctionsPolicy')} →
                  </Link>
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
                  <Link
                    href={PUBLIC_ROUTES.corrections}
                    className="inline-block mt-2 text-[11px] font-mono uppercase tracking-wider text-rose-400/70 hover:text-rose-300 underline underline-offset-4 transition-colors"
                  >
                    {t('Inquiry.correctionsPolicy')} →
                  </Link>
                </div>
              )}

              {/* At a glance — the publication's key findings in 30 seconds.
                  Only when the editorial parse yielded a findings list. */}
              {editorial?.keyFindingsHtml && (
                <div className="border border-black/[0.12] dark:border-white/[0.12] bg-black/[0.02] dark:bg-white/[0.02] p-5 mb-2 print:border-black/30 dark:print:border-white/30">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 dark:text-white/45 mb-3">
                    {t('Inquiry.atAGlance')}
                  </p>
                  <ul
                    className="list-disc list-outside pl-5 space-y-1.5 text-sm text-black/75 dark:text-white/75 leading-relaxed [&_li]:pl-1"
                    dangerouslySetInnerHTML={{ __html: editorial.keyFindingsHtml }}
                  />
                </div>
              )}
            </div>

            {inquiry.topics.length > 0 && (
              <div className="mb-8 flex flex-wrap gap-2">
                {inquiry.topics.map((topic) => (
                  <span
                    key={topic}
                    className="flex items-center gap-1 px-3 py-1 border border-black/[0.12] dark:border-white/[0.12] text-black/65 dark:text-white/65 text-xs"
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
              <LegacyInquiryBody html={extractLegacyArticleBody(inquiry.content)} />
            )}

            <div className="print:hidden">
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
            </div>

            {/* Version history — visible when the piece was corrected/retracted */}
            {((inquiry as any).correctedAt || (inquiry as any).status === "RETRACTED") && (
              <div className="mt-10 print:hidden">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 dark:text-white/45 mb-2">
                  {t('Inquiry.versionHistory')}
                </p>
                <ul className="space-y-1 font-mono text-[11px] text-black/50 dark:text-white/50">
                  <li>{t('Inquiry.versionPublished', { n: 1, date: new Date(inquiry.publishedAt).toLocaleDateString() })}</li>
                  {(inquiry as any).correctedAt && (
                    <li>{t('Inquiry.versionCorrected', { n: 2, date: new Date((inquiry as any).correctedAt).toLocaleDateString() })}</li>
                  )}
                  {(inquiry as any).status === "RETRACTED" && (inquiry as any).retractedAt && (
                    <li>{t('Inquiry.versionRetracted', { date: new Date((inquiry as any).retractedAt).toLocaleDateString() })}</li>
                  )}
                </ul>
              </div>
            )}

            {/* Cite this publication — APA inline + BibTeX/RIS downloads */}
            <CiteBlock id={inquiry.id} title={inquiry.title} publishedAt={inquiry.publishedAt} />

            {/* Newsletter capture — the institutional reader funnel */}
            <NewsletterCta publicationId={inquiry.id} />

            <div className="print:hidden">
              {/* Reader feedback — error reporting + rating */}
              <ReaderFeedback publicationId={inquiry.id} />

              {/* Like / Dislike / Comment / Share */}
              <PublicationActions publicationId={inquiry.id} publicationTitle={inquiry.title} />

              {/* Commission CTA — convert readers into paying clients */}
              <CommissionCTA />
            </div>

            {related.length > 0 && (
              <div className="mt-16 pt-8 border-t border-black/[0.08] dark:border-white/[0.08] print:hidden">
                <h3 className="font-display text-lg font-semibold text-black dark:text-white mb-6">
                  {inquiry.domain && inquiry.domain !== "general"
                    ? t('Inquiry.moreFromDomain', { domain: inquiry.domain })
                    : t('Inquiry.relatedBriefs')}
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {related.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => router.push(PUBLIC_ROUTES.inquiry(item.id))}
                      className="w-full text-left nx-public-surface p-5 hover:border-black/20 dark:hover:border-white/20 transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-black/55 dark:text-white/55 uppercase tracking-wider font-mono">
                          {inquiryTypeLabel(item.type)}
                        </span>
                        <span className="text-xs text-black/50 dark:text-white/50 font-mono">{item.readTime} {t('Inquiry.min')}</span>
                      </div>
                      <h4 className="text-sm font-medium text-black/90 dark:text-white/90 mb-1 line-clamp-2 group-hover:text-black dark:group-hover:text-white transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-xs text-black/55 dark:text-white/55 font-mono">
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
        <FileText className="w-12 h-12 text-black/20 dark:text-white/20 mx-auto mb-4" />
        <h3 className="font-display text-xl font-semibold text-text mb-2">{t('Inquiry.notFoundTitle')}</h3>
        <p className="text-sm text-black/40 dark:text-white/40 mb-6">
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
