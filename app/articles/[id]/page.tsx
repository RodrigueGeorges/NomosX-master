"use client";
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Calendar, Clock, Users, Share2, Download, FileText, BookOpen, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize';
import AuthModal from '@/components/AuthModal';

type ArticleType = 'RESEARCH_BRIEF' | 'UPDATE_NOTE' | 'DATA_NOTE' | 'POLICY_NOTE' | 'DOSSIER'
  | 'EXECUTIVE_BRIEF' | 'STRATEGIC_REPORT' | 'SUMMARY_BRIEF';

function articleTypeLabel(type: ArticleType): string {
  switch (type) {
    case 'RESEARCH_BRIEF':   return 'Executive Brief';
    case 'UPDATE_NOTE':      return 'Update Note';
    case 'DATA_NOTE':        return 'Data Note';
    case 'POLICY_NOTE':      return 'Policy Brief';
    case 'DOSSIER':          return 'Strategic Dossier';
    case 'STRATEGIC_REPORT': return 'Strategic Report';
    case 'EXECUTIVE_BRIEF':  return 'Executive Brief';
    case 'SUMMARY_BRIEF':    return 'Summary Brief';
    default:                 return 'Executive Brief';
  }
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
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchArticle(params.id as string);
      checkSubscription();
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

  const checkSubscription = async () => {
    try {
      const response = await fetch('/api/subscription/status');
      if (response.ok) {
        const data = await response.json();
        // Mirrors API isPaidUser: TRIAL and ANALYST get truncated, all paid plans get full HTML
        setIsSubscribed(data.plan !== 'TRIAL' && data.plan !== 'ANALYST' && !!data.plan);
      }
    } catch (error) {
      console.error('Failed to check subscription:', error);
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
    if (!isSubscribed) {
      setShowAuthModal(true);
      return;
    }

    if (!article) return;

    try {
      const response = await fetch(`/api/articles/${article.id}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${article.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to export article:', error);
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

  return (
    <>
      {articleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      )}
      <div className="min-h-screen bg-[#09090b] text-white">
        {/* Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[900px]">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.06] via-violet-500/[0.03] to-transparent blur-3xl" />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />
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
                  className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.12] transition-all"
                  title="Export as PDF"
                >
                  <Download size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid lg:grid-cols-4 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-3">
              {/* Article Header */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 text-xs font-medium">
                    {articleTypeLabel(article.type)}
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
                      title="Score composite calculé par le pipeline : qualité des sources, nombre de citations, statut peer-reviewed, et validation multi-agents (Critical Loop + Debate)."
                    >
                      Source Quality: {article.trustScore}%{article.trustScore >= 75 ? ' ✓' : ''}
                    </span>
                  )}
                </div>

                <h1 className="font-display text-3xl md:text-4xl font-light text-white mb-4">
                  {article.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 text-sm text-white/40">
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
              </div>

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
              <div className="prose prose-invert prose-lg max-w-none">
                {isSubscribed ? (
                  <div 
                    className="article-content text-white/80 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }}
                  />
                ) : (
                  <>
                    {/* Teaser — server returns first 3 paragraphs, plain text */}
                    <div className="text-white/70 leading-relaxed text-base mb-8 whitespace-pre-line">
                      {article.content}
                    </div>

                    {/* Paywall fade + CTA */}
                    <div className="relative">
                      <div className="absolute inset-x-0 -top-20 h-20 bg-gradient-to-b from-transparent to-[#09090b] pointer-events-none" />
                      <div className="text-center py-12 border-t border-white/[0.06]">
                        <BookOpen className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-white mb-2">
                          Read the full {articleTypeLabel(article.type).toLowerCase()}
                        </h3>
                        <p className="text-white/50 mb-6 max-w-md mx-auto text-sm">
                          Subscribe to access the complete analysis, sourced citations, and actionable recommendations.
                        </p>
                        <button
                          onClick={() => setShowAuthModal(true)}
                          className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-lg shadow-indigo-500/20"
                        >
                          Subscribe Now
                        </button>
                        <p className="text-xs text-white/25 mt-4">From €19/month · 30-day free trial · Cancel anytime</p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Navigation */}
              {isSubscribed && (
                <div className="flex items-center justify-between mt-12 pt-8 border-t border-white/[0.06]">
                  <button className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                    <ArrowLeft size={16} />
                    Previous Article
                  </button>
                  <button className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                    Next Article
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              {/* Related Articles */}
              {relatedArticles.length > 0 && (
                <div className="sticky top-6">
                  <h3 className="font-display text-lg font-light text-white mb-4">Related Articles</h3>
                  <div className="space-y-4">
                    {relatedArticles.map((related) => (
                      <button
                        key={related.id}
                        onClick={() => router.push(`/articles/${related.id}`)}
                        className="w-full text-left p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:border-indigo-500/20 transition-all group"
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
