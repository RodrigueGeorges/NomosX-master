"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import { Calendar, Filter, Search, FileText, TrendingUp, ArrowRight, Clock, Users, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ArticleSummary {
  id: string;
  title: string;
  summary: string;
  type: 'RESEARCH_BRIEF' | 'UPDATE_NOTE' | 'DATA_NOTE' | 'POLICY_NOTE' | 'DOSSIER' | 'EXECUTIVE_BRIEF' | 'STRATEGIC_REPORT' | 'SUMMARY_BRIEF';
  publishedAt: string;
  readTime: number;
  sources: number;
  topics: string[];
  tier: 'EXECUTIVE' | 'STRATEGIC';
  displayType: string;
}

export default function ArticlesPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'executive' | 'strategic'>('all');
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
    
    const executiveTypes = new Set(['EXECUTIVE_BRIEF', 'RESEARCH_BRIEF', 'UPDATE_NOTE', 'DATA_NOTE', 'POLICY_NOTE', 'SUMMARY_BRIEF']);
    const strategicTypes = new Set(['STRATEGIC_REPORT', 'DOSSIER']);
    const matchesType = filterType === 'all' ||
      (filterType === 'executive' && executiveTypes.has(article.type)) ||
      (filterType === 'strategic' && strategicTypes.has(article.type));
    
    return matchesSearch && matchesType;
  });

  return (
    <>
      <div className="min-h-screen bg-[#09090b] text-white overflow-hidden">
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
            <div className="flex items-center justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 mb-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-glow" />
                  <span className="text-xs text-indigo-300 font-medium tracking-wide">PUBLICATIONS</span>
                </div>
                <h1 className="font-display text-4xl sm:text-5xl font-bold text-white mb-2">
                  Council <span className="nx-gradient-text">Publications</span>
                </h1>
                <p className="text-white/35 text-sm tracking-wide">
                  Every brief verified. Every source traced. Zero editorial opinion.
                </p>
              </div>
              <button
                onClick={() => setShowAuthModal(true)}
                className="group px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all duration-300 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.03] inline-flex items-center gap-2"
              >
                Sign in — it&apos;s free
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mt-6">
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
                  { value: 'all', label: 'All Articles' },
                  { value: 'executive', label: 'Executive Briefs' },
                  { value: 'strategic', label: 'Strategic Reports' },
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
                  <div key={article.id} className="group rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 hover:border-indigo-500/15 transition-all duration-300">
                    {/* Type Badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-indigo-400/60"></div>
                      <span className="text-xs text-indigo-400/50 uppercase tracking-wider">
                        {article.displayType || (article.type === 'STRATEGIC_REPORT' ? 'Strategic Report' : 'Executive Brief')}
                      </span>
                      <div className="ml-auto flex items-center gap-2 text-xs text-white/30">
                        <Clock size={12} />
                        {article.readTime} min
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

                    {/* Meta */}
                    <div className="flex items-center justify-between text-xs text-white/30 mb-4">
                      <div className="flex items-center gap-3">
                        <span>{article.sources} sources</span>
                        <span>•</span>
                        <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
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
                      className="w-full py-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 font-medium hover:bg-indigo-500/10 transition-all group-hover:border-indigo-500/40"
                    >
                      <span className="flex items-center justify-center gap-2">
                        Read full article
                        <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                      </span>
                    </button>
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
            setIsAuthenticated(true);
            router.push('/dashboard');
          }}
        />
      )}
    </>
  );
}
