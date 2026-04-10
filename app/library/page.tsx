"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, BookOpen, FileText, Calendar, Clock, Tag, ArrowRight, Download, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AuthModal from '@/components/AuthModal';

interface LibraryItem {
  id: string;
  title: string;
  type: 'EXECUTIVE_BRIEF' | 'STRATEGIC_REPORT' | 'ANALYSIS' | 'RESEARCH_PAPER';
  description: string;
  publishedAt: string;
  readTime: number;
  topics: string[];
  downloadCount: number;
  isPremium: boolean;
}

export default function LibraryPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'briefs' | 'reports' | 'analysis' | 'papers'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'alphabetical'>('recent');

  useEffect(() => {
    fetchLibraryItems();
  }, []);

  const fetchLibraryItems = async () => {
    setLoading(true);
    try {
      // Simuler des données de bibliothèque
      const mockData: LibraryItem[] = [
        {
          id: '1',
          title: 'AI Impact on Global Markets',
          type: 'EXECUTIVE_BRIEF',
          description: 'Comprehensive analysis of artificial intelligence effects on global financial markets and investment strategies.',
          publishedAt: '2024-02-15',
          readTime: 8,
          topics: ['AI', 'Markets', 'Investment', 'Technology'],
          downloadCount: 245,
          isPremium: false
        },
        {
          id: '2',
          title: 'Climate Change Policy Framework',
          type: 'STRATEGIC_REPORT',
          description: 'In-depth strategic analysis of climate policy frameworks and their economic implications for 2024-2030.',
          publishedAt: '2024-02-10',
          readTime: 15,
          topics: ['Climate', 'Policy', 'Economics', 'Sustainability'],
          downloadCount: 189,
          isPremium: true
        },
        {
          id: '3',
          title: 'Geopolitical Risk Assessment',
          type: 'ANALYSIS',
          description: 'Quarterly assessment of geopolitical risks and their impact on international business operations.',
          publishedAt: '2024-02-08',
          readTime: 12,
          topics: ['Geopolitics', 'Risk', 'International', 'Business'],
          downloadCount: 156,
          isPremium: true
        },
        {
          id: '4',
          title: 'Digital Transformation Trends',
          type: 'RESEARCH_PAPER',
          description: 'Academic research on digital transformation trends and their adoption across different industries.',
          publishedAt: '2024-02-05',
          readTime: 20,
          topics: ['Digital', 'Transformation', 'Technology', 'Industry'],
          downloadCount: 312,
          isPremium: false
        }
      ];
      
      setLibraryItems(mockData);
    } catch (error) {
      console.error('Failed to fetch library items:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = libraryItems.filter(item => {
    const matchesSearch = !searchTerm || 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || 
      (filterType === 'briefs' && item.type === 'EXECUTIVE_BRIEF') ||
      (filterType === 'reports' && item.type === 'STRATEGIC_REPORT') ||
      (filterType === 'analysis' && item.type === 'ANALYSIS') ||
      (filterType === 'papers' && item.type === 'RESEARCH_PAPER');
    
    return matchesSearch && matchesType;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
      case 'recent':
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      case 'popular':
        return b.downloadCount - a.downloadCount;
      case 'alphabetical':
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'EXECUTIVE_BRIEF': return 'text-blue-400 border-blue-400/20 bg-blue-400/5';
      case 'STRATEGIC_REPORT': return 'text-purple-400 border-purple-400/20 bg-purple-400/5';
      case 'ANALYSIS': return 'text-green-400 border-green-400/20 bg-green-400/5';
      case 'RESEARCH_PAPER': return 'text-orange-400 border-orange-400/20 bg-orange-400/5';
      default: return 'text-gray-400 border-gray-400/20 bg-gray-400/5';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'EXECUTIVE_BRIEF': return 'Executive Brief';
      case 'STRATEGIC_REPORT': return 'Strategic Report';
      case 'ANALYSIS': return 'Analysis';
      case 'RESEARCH_PAPER': return 'Research Paper';
      default: return 'Document';
    }
  };

  return (
    <>
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
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <div className="text-center mb-8">
              <h1 className="font-display text-4xl font-light text-white mb-4">
                Research <span className="nx-gradient-text">Library</span>
              </h1>
              <p className="text-white/40 max-w-2xl mx-auto">
                Access our comprehensive collection of strategic briefs, reports, and analysis. 
                Your gateway to institutional intelligence and research insights.
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search library..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white placeholder-white/40 focus:border-indigo-500/40 focus:outline-none transition-all"
                />
              </div>
              
              <div className="flex gap-2">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'briefs', label: 'Briefs' },
                  { value: 'reports', label: 'Reports' },
                  { value: 'analysis', label: 'Analysis' },
                  { value: 'papers', label: 'Papers' },
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

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white focus:border-indigo-500/40 focus:outline-none transition-all"
              >
                <option value="recent">Most Recent</option>
                <option value="popular">Most Popular</option>
                <option value="alphabetical">Alphabetical</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="flex items-center gap-3 text-white/40">
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span>Loading library...</span>
              </div>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">No items found</h3>
              <p className="text-white/40">
                {searchTerm ? 'Try adjusting your search terms' : 'Check back later for new content'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {sortedItems.map((item) => (
                  <div key={item.id} className="group rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 hover:border-indigo-500/20 transition-all duration-300">
                    {/* Type Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={cn(
                        "px-3 py-1 rounded-full border text-xs font-medium",
                        getTypeColor(item.type)
                      )}>
                        {getTypeLabel(item.type)}
                      </span>
                      {item.isPremium && (
                        <span className="px-2 py-1 rounded-full border border-yellow-500/20 bg-yellow-500/5 text-yellow-400 text-xs font-medium">
                          Premium
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="font-display text-lg font-light text-white/90 mb-3 line-clamp-2 group-hover:text-indigo-300/80 transition-colors">
                      {item.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-white/40 leading-relaxed mb-4 line-clamp-3">
                      {item.description}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center justify-between text-xs text-white/30 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(item.publishedAt).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          {item.readTime} min
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Download size={12} />
                        {item.downloadCount}
                      </div>
                    </div>

                    {/* Topics */}
                    {item.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {item.topics.slice(0, 3).map((topic, index) => (
                          <span key={index} className="text-xs px-2 py-1 rounded-full border border-white/[0.1] text-white/50">
                            {topic}
                          </span>
                        ))}
                        {item.topics.length > 3 && (
                          <span className="text-xs px-2 py-1 rounded-full border border-white/[0.1] text-white/30">
                            +{item.topics.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => item.isPremium ? setShowAuthModal(true) : router.push(`/articles/${item.id}`)}
                        className="flex-1 py-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 font-medium hover:bg-indigo-500/10 transition-all"
                      >
                        {item.isPremium ? 'Unlock' : 'Read'}
                      </button>
                      <button className="p-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.12] transition-all">
                        <Share2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-white mb-1">{libraryItems.length}</div>
                  <div className="text-xs text-white/40">Total Documents</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-white mb-1">
                    {libraryItems.filter(item => item.isPremium).length}
                  </div>
                  <div className="text-xs text-white/40">Premium Content</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-white mb-1">
                    {libraryItems.reduce((sum, item) => sum + item.downloadCount, 0)}
                  </div>
                  <div className="text-xs text-white/40">Total Downloads</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-white mb-1">
                    {Math.round(libraryItems.reduce((sum, item) => sum + item.readTime, 0) / libraryItems.length)}
                  </div>
                  <div className="text-xs text-white/40">Avg. Read Time</div>
                </div>
              </div>
            </>
          )}
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
