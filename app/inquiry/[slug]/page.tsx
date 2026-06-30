"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Users,
  Share2,
  Download,
  FileText,
  Tag,
  Shield,
  Activity,
  Database,
  Scale,
  AlertTriangle,
} from "lucide-react";
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
      text: `NomosX inquiry: ${inquiry.title}`,
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
          <span>Loading inquiry...</span>
        </div>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <FileText className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="font-display text-xl font-semibold text-text mb-2">Inquiry not found</h3>
          <p className="text-sm text-white/40 mb-6">
            This inquiry does not exist or is not publicly available.
          </p>
          <button
            type="button"
            onClick={() => router.push(PUBLIC_ROUTES.archives)}
            className={cn(nx.btnGhost, "normal-case tracking-normal font-medium")}
          >
            Back to inquiries
          </button>
        </div>
      </div>
    );
  }

  const trustScore = inquiry.trustScore ?? 0;
  const gateTone =
    inquiry.trustScore == null
      ? "logged"
      : trustScore >= 75
        ? "approved"
        : trustScore >= 50
          ? "review"
          : "held";
  const format = inquiry.format || getPublicationFormat(inquiry.type);
  const protocolItems = [
    { icon: Database, label: "Corpus", value: `${inquiry.sources} sources`, detail: "ranked evidence base" },
    { icon: Shield, label: "Gate", value: gateTone, detail: "quality threshold" },
    { icon: Scale, label: "Dissent", value: "forced", detail: "counter-position required" },
    { icon: Activity, label: "Lineage", value: "logged", detail: "pipeline audit trail" },
  ];

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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 border-b border-white/[0.06] flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push(PUBLIC_ROUTES.archives)}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            Back to inquiries
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
              className="p-2 rounded-lg border border-white/[0.08] text-white/50 disabled:opacity-40"
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
          <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-8">
            <div>
              <div className="mb-8 nx-public-surface p-6 sm:p-8 overflow-hidden relative">
                <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 border border-white/20 bg-white/[0.04] text-white/80 text-xs font-medium font-mono uppercase tracking-wider">
                    {format.label}
                  </span>
                  {inquiry.trustScore != null && (
                    <span
                      className={`px-3 py-1 rounded-full border text-xs font-medium font-mono ${
                        inquiry.trustScore >= 75
                          ? "border-success/20 bg-success/5 text-success"
                          : inquiry.trustScore >= 50
                            ? "border-white/20 bg-white/[0.04] text-white"
                            : "border-warning/20 bg-warning/5 text-warning"
                      }`}
                      title="Composite score: source quality, citations, adversarial review, and arbitration gate."
                    >
                      Confidence {inquiry.trustScore}%
                    </span>
                  )}
                </div>

                <h1 className="font-display text-3xl md:text-4xl font-semibold text-text mb-4">{inquiry.title}</h1>

                <div className="flex flex-wrap items-center gap-4 text-sm text-white/40 mb-6 font-mono">
                  <span className="flex items-center gap-2">
                    <Calendar size={14} />
                    {new Date(inquiry.publishedAt).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-2">
                    <Clock size={14} />
                    {inquiry.readTime} min read
                  </span>
                  <span className="flex items-center gap-2">
                    <FileText size={14} />
                    {inquiry.sources} sources
                  </span>
                  {inquiry.author && (
                    <span className="flex items-center gap-2">
                      <Users size={14} />
                      {inquiry.author}
                    </span>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {protocolItems.map((item) => {
                    const PIcon = item.icon;
                    return (
                      <div key={item.label} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                        <PIcon size={15} className="text-white/45 mb-4" />
                        <div className="text-[10px] text-white/25 uppercase tracking-[0.16em] font-mono">{item.label}</div>
                        <div className="text-sm text-white/80 font-semibold mt-1">{item.value}</div>
                        <div className="text-[11px] text-white/30 mt-1">{item.detail}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {inquiry.topics.length > 0 && (
                <div className="mb-8 flex flex-wrap gap-2">
                  {inquiry.topics.map((topic) => (
                    <span
                      key={topic}
                      className="flex items-center gap-1 px-3 py-1 rounded-full border border-white/[0.1] text-white/50 text-xs"
                    >
                      <Tag size={10} />
                      {topic}
                    </span>
                  ))}
                </div>
              )}

              <div className="mb-8 grid md:grid-cols-3 gap-3">
                {[
                  { label: "Method", value: "source-ranked synthesis" },
                  { label: "Correction", value: "auditable revisions" },
                  { label: "Limit", value: "confidence over certainty" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.018] px-4 py-3">
                    <div className="text-[10px] text-white/25 uppercase tracking-[0.16em] font-mono">{item.label}</div>
                    <div className="mt-1 text-sm text-white/65">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className={nx.prose}>
                <div
                  className="article-content text-white/80 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(inquiry.content) }}
                />
              </div>

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

              <div className="mt-12 pt-8 border-t border-white/[0.06] text-center">                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className={cn(nx.btnGhost, "normal-case tracking-normal")}
                >
                  Commission a NomosX Studio follow-up
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>

            <aside className="lg:col-span-1">
              <div className="sticky top-24 space-y-5">
                <div className="nx-public-surface overflow-hidden">
                  <div className="p-4 border-b border-white/[0.08]">
                    <div className="text-[10px] text-white/40 uppercase tracking-[0.18em] font-semibold font-mono mb-2">
                      Verification stack
                    </div>
                    <div className="text-sm text-white/85 font-medium">Publication protocol</div>
                  </div>
                  <div className="p-4 space-y-4">
                    {[
                      { label: "Source corpus", value: `${inquiry.sources} sources`, tone: "bg-white" },
                      { label: "Format", value: format.shortLabel, tone: "bg-white" },
                      { label: "Citation layer", value: "visible", tone: "bg-white" },
                      {
                        label: "Arbitration gate",
                        value: inquiry.trustScore != null ? `${inquiry.trustScore}%` : "logged",
                        tone: "bg-success",
                      },
                      {
                        label: "Foresight",
                        value: foresight.available
                          ? `${foresight.telemetry.monteCarloRuns.toLocaleString()} runs`
                          : "—",
                        tone: foresight.available ? "bg-white" : "bg-white/20",
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-3">
                        <span className={`mt-1.5 h-2 w-2 rounded-full ${item.tone}`} />
                        <div className="min-w-0">
                          <div className="text-[11px] text-white/30 font-mono">{item.label}</div>
                          <div className="text-xs text-white/70 font-medium">{item.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="nx-public-surface p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} className="text-white/50 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] text-white/35 uppercase tracking-[0.18em] font-semibold font-mono mb-2">
                        Reader note
                      </div>
                      <p className="text-xs text-white/45 leading-relaxed">
                        NomosX treats confidence as provisional. Strong claims remain tied to source quality, dissent,
                        and revision history.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="nx-public-surface p-4">
                  <div className="text-[10px] text-white/25 uppercase tracking-[0.18em] font-semibold font-mono mb-3">
                    Map to decide
                  </div>
                  <div className="space-y-2.5">
                    {["Evidence mapped", "Collisions surfaced", "Distribution quantified", "Position taken"].map(
                      (step, i) => (
                        <div key={step} className="flex items-center gap-2.5 text-xs text-white/45">
                          <span className="w-5 h-5 border border-white/[0.08] bg-black/20 flex items-center justify-center text-[10px] font-mono text-white/60">
                            {i + 1}
                          </span>
                          {step}
                        </div>
                      )
                    )}
                  </div>
                </div>

                {related.length > 0 && (
                  <div>
                    <h3 className="font-display text-lg font-semibold text-text mb-4">Related inquiries</h3>
                    <div className="space-y-4">
                      {related.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => router.push(PUBLIC_ROUTES.inquiry(item.id))}
                          className="w-full text-left nx-public-surface p-4 hover:border-white/20 transition-colors group"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-white/40 uppercase tracking-wider font-mono">
                              {inquiryTypeLabel(item.type)}
                            </span>
                            <span className="text-xs text-white/30 font-mono">{item.readTime} min</span>
                          </div>
                          <h4 className="text-sm font-medium text-white/90 mb-1 line-clamp-2 group-hover:text-white transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-xs text-white/40 font-mono">
                            {new Date(item.publishedAt).toLocaleDateString()}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </PageSection>
      </PublicPageShell>

      {showAuthModal && <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
