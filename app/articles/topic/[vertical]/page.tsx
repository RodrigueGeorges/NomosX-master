"use client";
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Clock, BookOpen } from 'lucide-react';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import AuthModal from '@/components/AuthModal';
import { getPublicationFormat } from '@/lib/publication-formats';

const VERTICALS: Record<string, {
  name: string; icon: string; color: string; description: string; keyword: string;
}> = {
  'eu-policy': {
    name: 'EU Policy', icon: '🇪🇺', color: '#3B82F6',
    description: 'EU regulations, directives, and institutional policy shifts.',
    keyword: 'European',
  },
  'climate-industry': {
    name: 'Climate & Industry', icon: '🌍', color: '#10B981',
    description: 'Energy transition, decarbonization, carbon pricing mechanisms.',
    keyword: 'climate',
  },
  'ai-labor': {
    name: 'AI & Labor', icon: '🤖', color: '#8B5CF6',
    description: 'AI impact on employment, automation, and future skills.',
    keyword: 'artificial intelligence',
  },
  'geopolitics': {
    name: 'Geopolitics', icon: '🌐', color: '#EF4444',
    description: 'International relations, security, diplomacy.',
    keyword: 'geopolitics',
  },
  'finance-regulation': {
    name: 'Finance & Regulation', icon: '💹', color: '#F59E0B',
    description: 'Financial markets, banking regulation, crypto-assets.',
    keyword: 'finance',
  },
};

interface Article {
  id: string;
  title: string;
  summary: string;
  type: string;
  publishedAt: string;
  readTime: number;
  sources: number;
  topics: string[];
  displayType: string;
  trustScore?: number | null;
  format?: ReturnType<typeof getPublicationFormat>;
}

export default function TopicPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.vertical as string;
  const vertical = VERTICALS[slug];

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (!vertical) return;
    fetchArticles();
  }, [slug, page]);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '12',
        search: vertical.keyword,
      });
      const res = await fetch(`/api/public/briefs?${params}`);
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
      <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/40 mb-4">Domain not found.</p>
          <button onClick={() => router.push('/articles')} className="text-indigo-400 hover:text-indigo-300">
            ← Back to publications
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[#09090b] text-white overflow-hidden">
        <div className="nx-noise" aria-hidden="true" />
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[900px] h-[700px] rounded-full -top-48 left-1/2 -translate-x-1/2" style={{ background: `radial-gradient(circle, ${vertical.color}18 0%, transparent 70%)` }} />
          <div className="nx-grid-bg absolute inset-0 opacity-20" />
        </div>

        <PublicNav currentPage="articles" onSignInClick={() => setShowAuthModal(true)} />

        {/* Header */}
        <div className="relative z-10 border-b border-white/[0.06]">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 py-8">
            <button
              onClick={() => router.push('/articles')}
              className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-sm mb-6"
            >
              <ArrowLeft size={14} />
              All publications
            </button>
            <div className="flex items-center gap-4 mb-3">
              <span className="text-3xl">{vertical.icon}</span>
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-2" style={{ borderColor: `${vertical.color}30`, background: `${vertical.color}08` }}>
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: vertical.color }} />
                  <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: vertical.color }}>Domain</span>
                </div>
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">{vertical.name}</h1>
              </div>
            </div>
            <p className="text-white/40 text-sm max-w-xl">{vertical.description}</p>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-8">
          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="flex items-center gap-3 text-white/40">
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span>Loading…</span>
              </div>
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/40">No publications in this domain yet.</p>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
                {articles.map((article) => {
                  const format = article.format || getPublicationFormat(article.type);
                  return (
                    <div
                      key={article.id}
                      onClick={() => router.push(`/articles/${article.id}`)}
                      className="group cursor-pointer rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 hover:border-white/[0.14] transition-all duration-300"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-amber-100/50 uppercase tracking-wider">{format.label}</span>
                        <div className="flex items-center gap-2">
                          {article.trustScore != null && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              article.trustScore >= 85 ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5'
                              : 'text-indigo-300 border-indigo-500/20 bg-indigo-500/5'
                            }`}>{article.trustScore}</span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-white/30">
                            <Clock size={11} />{article.readTime} min
                          </span>
                        </div>
                      </div>
                      <h3 className="font-display text-sm font-light text-white/90 mb-2 line-clamp-2 group-hover:text-indigo-200/80 transition-colors leading-snug">
                        {article.title}
                      </h3>
                      <p className="text-xs text-white/35 line-clamp-3 leading-relaxed mb-3">{article.summary}</p>
                      <div className="flex items-center justify-between text-[10px] text-white/25">
                        <span>{article.sources} sources</span>
                        <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 rounded-lg border border-white/[0.08] text-sm text-white/50 hover:text-white/80 disabled:opacity-30 transition-all"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-white/30">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 rounded-lg border border-white/[0.08] text-sm text-white/50 hover:text-white/80 disabled:opacity-30 transition-all"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <SiteFooter onSignInClick={() => setShowAuthModal(true)} />
      </div>

      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => { setShowAuthModal(false); router.push('/dashboard'); }}
        />
      )}
    </>
  );
}
