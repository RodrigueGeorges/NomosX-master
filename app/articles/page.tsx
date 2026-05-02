"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import { Search, ArrowRight, Clock, BookOpen, Shield, Activity, Database, Scale, Rss } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GreekProtocolStrip } from '@/components/brand/GreekProtocol';
import { FORMAT_FILTERS, getPublicationFormat, type PublicationFormatFamily } from '@/lib/publication-formats';

const DOMAIN_NAV = [
  { slug: 'eu-policy',          label: 'EU Policy',             icon: '🇪🇺', color: '#3B82F6' },
  { slug: 'climate-industry',   label: 'Climate & Industry',    icon: '🌍', color: '#10B981' },
  { slug: 'ai-labor',           label: 'AI & Labor',            icon: '🤖', color: '#8B5CF6' },
  { slug: 'geopolitics',        label: 'Geopolitics',           icon: '🌐', color: '#EF4444' },
  { slug: 'finance-regulation', label: 'Finance & Regulation',  icon: '💹', color: '#F59E0B' },
];

interface ArticleSummary {
  id: string;
  title: string;
  summary: string;
  type: 'RESEARCH_BRIEF' | 'UPDATE_NOTE' | 'DATA_NOTE' | 'POLICY_NOTE' | 'DOSSIER' | 'EXECUTIVE_BRIEF' | 'STRATEGIC_REPORT' | 'SUMMARY_BRIEF';
  publishedAt: string;
  readTime: number;
  sources: number;
  topics: string[];
  tier: string;
  displayType: string;
  format?: ReturnType<typeof getPublicationFormat>;
  trustScore?: number | null;
}

export default function ArticlesPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | PublicationFormatFamily>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchArticles();
  }, [page, filterType, searchTerm]);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '12',
        ...(filterType !== 'all' && { type: filterType }),
        ...(searchTerm && { search: searchTerm }),
      });

      const response = await fetch(`/api/public/briefs?${params}`);
      const data = await response.json();
      
      setArticles(data.briefs || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReadFull = (articleId: string) => {
    router.push(`/articles/${articleId}`);
  };

  const filteredArticles = articles.filter(article => {
    const matchesSearch = !searchTerm || 
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.summary.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  return (
    <>
      <div className="min-h-screen nx-immersive-root text-white overflow-hidden">
        <div className="nx-noise" aria-hidden="true" />
        {/* Background — aurora */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[900px] h-[700px] rounded-full -top-48 left-1/2 -translate-x-1/2 animate-aurora-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)' }} />
          <div className="absolute w-[600px] h-[600px] rounded-full top-1/3 -right-32 animate-aurora-2" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)' }} />
          <div className="absolute w-[500px] h-[500px] rounded-full bottom-1/4 -left-24 animate-aurora-3" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)' }} />
          <div className="nx-grid-bg absolute inset-0 opacity-30" />
        </div>

        {/* Nav */}
        <PublicNav currentPage="articles" onSignInClick={() => setShowAuthModal(true)} />

        {/* Header */}
        <div className="relative z-10 border-b border-white/[0.06]">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 py-8">
            <div className="nx-ancient-frame p-6 sm:p-8">
              <div className="flex items-center justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-300/20 bg-amber-300/8 mb-4 nx-ancient-banner">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-200 shadow-[0_0_16px_rgba(245,215,120,0.45)]" />
                  <span className="text-xs text-amber-100 font-medium tracking-[0.22em] uppercase">PUBLICATIONS</span>
                </div>
                <h1 className="font-display text-4xl sm:text-5xl font-bold text-white mb-2">
                  Council <span className="nx-gradient-text">Publications</span>
                </h1>
                <p className="text-white/35 text-sm tracking-wide">
                  Every brief verified. Every source traced. Zero editorial opinion.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href="/feed.xml"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/40 hover:text-orange-400 hover:border-orange-500/20 transition-all"
                  title="RSS Feed"
                >
                  <Rss size={16} />
                </a>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="group px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all duration-300 shadow-lg shadow-amber-300/10 hover:shadow-amber-300/20 hover:scale-[1.03] inline-flex items-center gap-2"
                >
                  Sign in — it&apos;s free
                  <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>

            {/* Domain nav */}
            <div className="flex flex-wrap gap-2 mt-6">
              {DOMAIN_NAV.map((d) => (
                <button
                  key={d.slug}
                  onClick={() => router.push(`/articles/topic/${d.slug}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-xs text-white/50 hover:text-white/80 hover:border-white/[0.16] transition-all"
                >
                  <span>{d.icon}</span>
                  <span>{d.label}</span>
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mt-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search articles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white placeholder-white/40 focus:border-indigo-500/40 focus:outline-none transition-all"
                />
              </div>
              
              <div className="flex gap-2">
                {[
                  ...FORMAT_FILTERS,
                ].map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setFilterType(filter.value as any)}
                    className={cn(
                      "px-4 py-2.5 rounded-lg border font-medium transition-all",
                      filterType === filter.value
                        ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                        : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.12]"
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* Protocol strip */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 pt-8">
          <GreekProtocolStrip compact className="mb-4" />
          <div className="mb-4 nx-oracle-panel p-5 overflow-hidden relative">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-400/45 via-amber-200/25 to-transparent" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-[10px] text-indigo-300/70 uppercase tracking-[0.2em] mb-2">Editorial Standard</div>
                <p className="text-sm text-white/55 leading-relaxed max-w-2xl">
                  Publications are treated as institutional records: source depth, adversarial review, citation integrity, and lineage are part of the product surface.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 min-w-[260px]">
                {[
                  { label: "Min", value: "5 src" },
                  { label: "Gate", value: "75+" },
                  { label: "Cadence", value: "scarce" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-center">
                    <div className="text-[10px] text-white/25 uppercase tracking-[0.14em]">{item.label}</div>
                    <div className="text-sm text-white/75 font-semibold mt-1">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: Activity, label: "Signal intake", value: "continuous" },
              { icon: Shield, label: "Citation guard", value: "mandatory" },
              { icon: Scale, label: "Dissent layer", value: "adversarial" },
              { icon: Database, label: "Lineage", value: "stored" },
            ].map((item) => {
              const PIcon = item.icon;
              return (
                <div key={item.label} className="nx-codex-cell">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-indigo-400/40 via-violet-300/20 to-transparent" />
                  <PIcon size={15} className="text-indigo-300/75 mb-4" />
                  <div className="text-[10px] text-white/25 uppercase tracking-[0.16em]">{item.label}</div>
                  <div className="text-sm text-white/75 font-medium mt-1">{item.value}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-8">
          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="flex items-center gap-3 text-white/40">
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span>Loading articles...</span>
              </div>
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">No articles found</h3>
              <p className="text-white/40">
                {searchTerm ? 'Try adjusting your search terms' : 'Check back later for new content'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {filteredArticles.map((article) => (
                  <div key={article.id} className="group rounded-2xl nx-oracle-panel p-6 hover:border-amber-300/15 transition-all duration-300">
                    {(() => {
                      const format = article.format || getPublicationFormat(article.type);
                      return (
                        <>
                    <div className="flex items-center gap-1.5 mb-4 text-[10px] text-white/25 font-mono tracking-[0.16em] uppercase">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.7)]" />
                      verified publication
                    </div>
                    {/* Type Badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-amber-300/60"></div>
                      <span className="text-xs text-amber-100/55 uppercase tracking-wider">
                        {format.label}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        {article.trustScore != null && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            article.trustScore >= 85
                              ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5'
                              : article.trustScore >= 75
                              ? 'text-indigo-300 border-indigo-500/20 bg-indigo-500/5'
                              : 'text-amber-300 border-amber-500/20 bg-amber-500/5'
                          }`}>
                            {article.trustScore}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-white/30">
                          <Clock size={12} />
                          {article.readTime} min
                        </span>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="font-display text-lg font-light text-white/90 mb-3 line-clamp-2 group-hover:text-indigo-200/80 transition-colors">
                      {article.title}
                    </h3>

                    {/* Summary */}
                    <p className="text-sm text-white/40 leading-relaxed mb-4 line-clamp-4">
                      {article.summary}
                    </p>

                    <div className="mb-4 rounded-lg border border-white/[0.06] bg-black/20 p-3">
                      <div className="flex items-center justify-between text-[10px] text-white/25 uppercase tracking-[0.14em] mb-2">
                        <span>Evidence stack</span>
                          <span>{format.pages}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-sm text-white/80 font-semibold">{article.sources}</div>
                          <div className="text-[10px] text-white/25">sources</div>
                        </div>
                        <div>
                          <div className="text-sm text-indigo-200 font-semibold">16</div>
                          <div className="text-[10px] text-white/25">checks</div>
                        </div>
                        <div>
                          <div className="text-sm text-amber-200 font-semibold">SRC</div>
                          <div className="text-[10px] text-white/25">linked</div>
                        </div>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-col gap-2 text-xs text-white/30 mb-4">
                      <div className="flex items-center gap-3">
                        <span>{article.sources} sources</span>
                        <span>•</span>
                        <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {article.trustScore !== null && (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                            Trust {article.trustScore}%
                          </span>
                        )}
                        {article.qualityScore !== null && (
                          <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-sky-200">
                            Quality {article.qualityScore}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Topics */}
                    {article.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {article.topics.slice(0, 3).map((topic, index) => (
                          <span key={index} className="text-xs px-2 py-1 rounded-full border border-white/[0.1] text-white/50">
                            {topic}
                          </span>
                        ))}
                        {article.topics.length > 3 && (
                          <span className="text-xs px-2 py-1 rounded-full border border-white/[0.1] text-white/30">
                            +{article.topics.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* CTA */}
                    <button
                      onClick={() => handleReadFull(article.id)}
                      className="w-full py-2.5 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] text-amber-100/80 font-medium hover:bg-amber-300/[0.08] transition-all group-hover:border-amber-300/40"
                    >
                      <span className="flex items-center justify-center gap-2">
                        Read full publication
                        <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                      </span>
                    </button>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 disabled:opacity-50 disabled:cursor-not-allowed hover:border-white/[0.12] transition-all"
                  >
                    Previous
                  </button>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={cn(
                          "px-4 py-2 rounded-lg border font-medium transition-all",
                          page === pageNum
                            ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                            : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.12]"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 disabled:opacity-50 disabled:cursor-not-allowed hover:border-white/[0.12] transition-all"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <SiteFooter onSignInClick={() => setShowAuthModal(true)} />

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSignupSuccess={() => {
            setShowAuthModal(false);
            router.push('/dashboard');
          }}
        />
      )}
    </>
  );
}
