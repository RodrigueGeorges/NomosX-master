"use client";
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Calendar, Clock, Users, Share2, Download, FileText, Tag, Shield, Activity, Database, Scale, AlertTriangle } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize';
import AuthModal from '@/components/AuthModal';
import { GreekProtocolStrip } from '@/components/brand/GreekProtocol';
import { getPublicationFormat } from '@/lib/publication-formats';

type ArticleType = 'RESEARCH_BRIEF' | 'UPDATE_NOTE' | 'DATA_NOTE' | 'POLICY_NOTE' | 'DOSSIER'
  | 'EXECUTIVE_BRIEF' | 'STRATEGIC_REPORT' | 'SUMMARY_BRIEF';

function articleTypeLabel(type: ArticleType): string {
  return getPublicationFormat(type).label;
}

interface Article {
  id: string;
  title: string;
  content: string;
  type: ArticleType;
  publishedAt: string;
  readTime: number;
  sources: number;
  topics: string[];
  author?: string;
  trustScore?: number;
  format?: ReturnType<typeof getPublicationFormat>;
}

interface RelatedArticle {
  id: string;
  title: string;
  type: ArticleType;
  publishedAt: string;
  readTime: number;
}

export default function ArticlePage() {
  const params = useParams();
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<RelatedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchArticle(params.id as string);
    }
  }, [params.id]);

  const fetchArticle = async (articleId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/articles/${articleId}`);
      if (response.ok) {
        const data = await response.json();
        setArticle(data.article);
        setRelatedArticles(data.relatedArticles || []);
      } else {
        // Article not found or access denied
        setShowAuthModal(true);
      }
    } catch (error) {
      console.error('Failed to fetch article:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share && article) {
      try {
        await navigator.share({
          title: article.title,
          text: `Read this strategic article: ${article.title}`,
          url: window.location.href,
        });
      } catch (error) {
        // Fallback to copying URL
        navigator.clipboard.writeText(window.location.href);
      }
    } else {
      // Fallback for browsers that don't support Web Share API
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleExport = async () => {
    if (!article || exporting) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/articles/${article.id}/export`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nomosx-${article.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60)}.html`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/40">
          <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <span>Loading article...</span>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-xl font-light text-white mb-2">Article not found</h3>
          <p className="text-white/40 mb-4">The article you're looking for doesn't exist or you don't have access to it.</p>
          <button
            onClick={() => router.push('/articles')}
            className="px-6 py-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 font-medium hover:bg-indigo-500/10 transition-all"
          >
            Back to Articles
          </button>
        </div>
      </div>
    );
  }

  const articleJsonLd = article ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    datePublished: article.publishedAt,
    author: { '@type': 'Organization', name: 'NomosX', url: 'https://nomosx.com' },
    publisher: { '@type': 'Organization', name: 'NomosX', logo: { '@type': 'ImageObject', url: 'https://nomosx.com/favicon.svg' } },
    description: article.content?.substring(0, 200)?.replace(/<[^>]*>/g, '') || article.title,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://nomosx.com/articles/${article.id}` },
    keywords: article.topics?.join(', '),
    articleSection: articleTypeLabel(article.type),
  } : null;
  const trustScore = article.trustScore ?? 0;
  const gateTone = article.trustScore == null
    ? "logged"
    : trustScore >= 75
      ? "approved"
      : trustScore >= 50
        ? "review"
        : "held";
  const format = article.format || getPublicationFormat(article.type);
  const protocolItems = [
    { icon: Database, label: "Corpus", value: `${article.sources} sources`, detail: "ranked evidence base" },
    { icon: Shield, label: "Gate", value: gateTone, detail: "quality threshold" },
    { icon: Scale, label: "Dissent", value: "forced", detail: "counter-position required" },
    { icon: Activity, label: "Lineage", value: "logged", detail: "agent audit trail" },
  ];

  return (
    <>
      {articleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      )}
      <div className="min-h-screen nx-immersive-root bg-[#09090b] text-white">
        {/* Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[900px]">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.06] via-violet-500/[0.03] to-transparent blur-3xl" />
          </div>
          <div className="nx-hex-bg absolute inset-0 opacity-20" />
        </div>

        {/* Header */}
        <div className="relative z-10 border-b border-white/[0.06]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => router.push('/articles')}
                className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
              >
                <ArrowLeft size={16} />
                Back to Articles
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleShare}
                  className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.12] transition-all"
                  title="Share article"
                >
                  <Share2 size={16} />
                </button>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.12] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Export as HTML (print to PDF)"
                >
                  {exporting
                    ? <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                    : <Download size={16} />
                  }
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-8">
            {/* Main Content */}
            <div>
              {/* Article Header */}
              <div className="mb-8 nx-oracle-panel nx-hud-frame p-6 sm:p-8 overflow-hidden relative">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-400/50 via-amber-200/25 to-transparent" />
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 text-xs font-medium">
                    {format.label}
                  </span>
                  {article.trustScore != null && (
                    <span
                      className={`px-3 py-1 rounded-full border text-xs font-medium cursor-help ${
                        article.trustScore >= 75
                          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                          : article.trustScore >= 50
                          ? 'border-indigo-500/20 bg-indigo-500/5 text-indigo-300'
                          : 'border-orange-500/20 bg-orange-500/5 text-orange-300'
                      }`}
                      title="Composite score computed by the pipeline: source quality, citation count, peer-review status, and multi-agent validation (Critical Loop + Debate)."
                    >
                      Source Quality: {article.trustScore}%{article.trustScore >= 75 ? ' ✓' : ''}
                    </span>
                  )}
                </div>

                <h1 className="font-display text-3xl md:text-4xl font-light text-white mb-4">
                  {article.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 text-sm text-white/40 mb-6">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    {new Date(article.publishedAt).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} />
                    {article.readTime} min read
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText size={14} />
                    {article.sources} sources
                  </div>
                  {article.author && (
                    <div className="flex items-center gap-2">
                      <Users size={14} />
                      {article.author}
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {protocolItems.map((item) => {
                    const PIcon = item.icon;
                    return (
                      <div key={item.label} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                        <PIcon size={15} className="text-indigo-300/75 mb-4" />
                        <div className="text-[10px] text-white/25 uppercase tracking-[0.16em]">{item.label}</div>
                        <div className="text-sm text-white/80 font-semibold mt-1">{item.value}</div>
                        <div className="text-[11px] text-white/30 mt-1">{item.detail}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <GreekProtocolStrip compact className="mb-8" />

              {/* Topics */}
              {article.topics.length > 0 && (
                <div className="mb-8">
                  <div className="flex flex-wrap gap-2">
                    {article.topics.map((topic, index) => (
                      <span key={index} className="flex items-center gap-1 px-3 py-1 rounded-full border border-white/[0.1] text-white/50 text-xs">
                        <Tag size={10} />
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Article Content */}
              <div className="mb-8 grid md:grid-cols-3 gap-3">
                {[
                  { label: "Method", value: "source-ranked synthesis" },
                  { label: "Correction", value: "auditable revisions" },
                  { label: "Limit", value: "confidence over certainty" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.018] px-4 py-3">
                    <div className="text-[10px] text-white/25 uppercase tracking-[0.16em]">{item.label}</div>
                    <div className="mt-1 text-sm text-white/65">{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Article Content */}
              <div className="prose prose-invert prose-lg max-w-none prose-headings:font-display prose-headings:font-light prose-p:text-white/75 prose-li:text-white/70 prose-a:text-indigo-300">
                <div
                  className="article-content text-white/80 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }}
                />
              </div>

              {/* Navigation */}
              <div className="mt-12 pt-8 border-t border-white/[0.06] text-center">
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] text-amber-100/80 text-sm font-medium hover:bg-amber-300/[0.08] transition-all"
                >
                  Commission a StudioX follow-up
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-6 space-y-5">
                <div className="rounded-xl border border-indigo-400/15 bg-indigo-500/[0.035] overflow-hidden">
                  <div className="p-4 border-b border-white/[0.06]">
                    <div className="text-[10px] text-indigo-300/80 uppercase tracking-[0.18em] font-semibold mb-2">Verification Stack</div>
                    <div className="text-sm text-white/85 font-medium">Publication protocol</div>
                  </div>
                  <div className="p-4 space-y-4">
                    {[
                      { label: 'Source corpus', value: `${article.sources} sources`, tone: 'bg-indigo-300' },
                      { label: 'Format', value: format.shortLabel, tone: 'bg-amber-100' },
                      { label: 'Citation layer', value: 'visible', tone: 'bg-amber-200' },
                      { label: 'Council gate', value: article.trustScore != null ? `${article.trustScore}%` : 'logged', tone: 'bg-emerald-300' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-3">
                        <span className={`mt-1.5 h-2 w-2 rounded-full ${item.tone} shadow-[0_0_14px_currentColor]`} />
                        <div className="min-w-0">
                          <div className="text-[11px] text-white/30">{item.label}</div>
                          <div className="text-xs text-white/70 font-medium">{item.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.035] p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-200/80 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] text-amber-100/60 uppercase tracking-[0.18em] font-semibold mb-2">Reader note</div>
                      <p className="text-xs text-white/45 leading-relaxed">
                        NomosX treats confidence as provisional. Strong claims should remain tied to source quality, dissent, and revision history.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="nx-codex-cell p-4">
                  <div className="text-[10px] text-white/25 uppercase tracking-[0.18em] font-semibold mb-3">Doxa to Nomos</div>
                  <div className="space-y-2.5">
                    {['Claim extracted', 'Evidence challenged', 'Dissent recorded', 'Limitations surfaced'].map((step, i) => (
                      <div key={step} className="flex items-center gap-2.5 text-xs text-white/45">
                        <span className="w-5 h-5 rounded-full border border-white/[0.08] bg-black/20 flex items-center justify-center text-[10px] font-mono text-indigo-300/70">{i + 1}</span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>

              {/* Related Articles */}
              {relatedArticles.length > 0 && (
                <div>
                  <h3 className="font-display text-lg font-light text-white mb-4">Related Articles</h3>
                  <div className="space-y-4">
                    {relatedArticles.map((related) => (
                      <button
                        key={related.id}
                        onClick={() => router.push(`/articles/${related.id}`)}
                        className="w-full text-left nx-codex-cell group"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-indigo-400/60 uppercase tracking-wider">
                            {articleTypeLabel(related.type)}
                          </span>
                          <span className="text-xs text-white/30">
                            {related.readTime} min
                          </span>
                        </div>
                        <h4 className="text-sm font-medium text-white/90 mb-1 line-clamp-2 group-hover:text-indigo-300 transition-colors">
                          {related.title}
                        </h4>
                        <p className="text-xs text-white/40">
                          {new Date(related.publishedAt).toLocaleDateString()}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal 
          isOpen={showAuthModal} 
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </>
  );
}
