"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Radar, TrendingUp, AlertTriangle, Activity, Clock, Filter, Eye, Bell, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import AuthModal from '@/components/AuthModal';

interface RadarSignal {
  id: string;
  title: string;
  description: string;
  type: 'emerging' | 'trending' | 'critical' | 'stable';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  detectedAt: string;
  confidence: number;
  impact: 'local' | 'regional' | 'global';
  category: string;
  keywords: string[];
  isPremium: boolean;
}

interface RadarCardRaw {
  id?: string;
  signalId?: string;
  title?: string;
  headline?: string;
  description?: string;
  summary?: string;
  type?: string;
  signalType?: string;
  severity?: string;
  source?: string;
  provider?: string;
  detectedAt?: string;
  createdAt?: string;
  confidence?: number;
  qualityScore?: number;
  impact?: string;
  category?: string;
  vertical?: string;
  keywords?: string[];
  tags?: string[];
  isPremium?: boolean;
  tier?: string;
}

export default function RadarPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [signals, setSignals] = useState<RadarSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'emerging' | 'trending' | 'critical'>('all');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'low' | 'medium' | 'high' | 'critical'>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchRadarSignals();
    
    if (autoRefresh) {
      const interval = setInterval(fetchRadarSignals, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchRadarSignals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/radar?limit=20');
      if (!res.ok) {
        if (res.status === 401) {
          setSignals([]);
          setUnauthenticated(true);
          return;
        }
        throw new Error(`Radar API returned ${res.status}`);
      }
      const data = await res.json();
      const cards: RadarSignal[] = (data.cards || []).map((c: RadarCardRaw) => ({
        id: c.id || c.signalId || Math.random().toString(36).slice(2),
        title: c.title || c.headline || '',
        description: c.description || c.summary || '',
        type: c.type || c.signalType || 'emerging',
        severity: c.severity || 'medium',
        source: c.source || c.provider || 'NomosX',
        detectedAt: c.detectedAt || c.createdAt || new Date().toISOString(),
        confidence: c.confidence || c.qualityScore || 0,
        impact: c.impact || 'global',
        category: c.category || c.vertical || 'General',
        keywords: c.keywords || c.tags || [],
        isPremium: c.isPremium ?? (c.tier !== 'ANALYST'),
      }));
      setSignals(cards);
    } catch (error) {
      console.error('Failed to fetch radar signals:', error);
      setSignals([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredSignals = signals.filter(signal => {
    const matchesSearch = !searchTerm || 
      signal.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      signal.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      signal.keywords.some(keyword => keyword.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = filterType === 'all' || signal.type === filterType;
    const matchesSeverity = filterSeverity === 'all' || signal.severity === filterSeverity;
    
    return matchesSearch && matchesType && matchesSeverity;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'emerging': return 'text-blue-400 border-blue-400/20 bg-blue-400/5';
      case 'trending': return 'text-green-400 border-green-400/20 bg-green-400/5';
      case 'critical': return 'text-red-400 border-red-400/20 bg-red-400/5';
      case 'stable': return 'text-gray-400 border-gray-400/20 bg-gray-400/5';
      default: return 'text-gray-400 border-gray-400/20 bg-gray-400/5';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return 'text-green-400';
      case 'medium': return 'text-yellow-400';
      case 'high': return 'text-orange-400';
      case 'critical': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'low': return Activity;
      case 'medium': return TrendingUp;
      case 'high': return AlertTriangle;
      case 'critical': return AlertTriangle;
      default: return Activity;
    }
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h ago`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d ago`;
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
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Radar className="w-8 h-8 text-indigo-400" />
                <div>
                  <h1 className="font-display text-3xl font-light text-white mb-1">
                    Signal <span className="nx-gradient-text">Radar</span>
                  </h1>
                  <p className="text-white/40 text-sm">
                    Real-time monitoring of emerging trends and critical signals
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-all",
                    autoRefresh
                      ? "border-green-500/40 bg-green-500/10 text-green-300"
                      : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.12]"
                  )}
                >
                  <RefreshCw className={cn("w-4 h-4", autoRefresh && "animate-spin")} />
                  Auto-refresh
                </button>
                
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 text-white font-medium hover:border-indigo-500/40 transition-all"
                >
                  Subscribe for alerts
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search signals..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white placeholder-white/40 focus:border-indigo-500/40 focus:outline-none transition-all"
                />
              </div>
              
              <div className="flex gap-2">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'emerging', label: 'Emerging' },
                  { value: 'trending', label: 'Trending' },
                  { value: 'critical', label: 'Critical' },
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
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value as any)}
                className="px-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white focus:border-indigo-500/40 focus:outline-none transition-all"
              >
                <option value="all">All Severities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
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
                <span>Scanning radar...</span>
              </div>
            </div>
          ) : unauthenticated && signals.length === 0 ? (
            <div className="text-center py-16">
              <Radar className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">Sign in to access the radar</h3>
              <p className="text-white/40 mb-6">The signal radar is available to registered users. Sign in to monitor emerging weak signals.</p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-500/25"
              >
                Sign in
              </button>
            </div>
          ) : filteredSignals.length === 0 ? (
            <div className="text-center py-16">
              <Radar className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">No signals detected</h3>
              <p className="text-white/40">
                {searchTerm ? 'Try adjusting your search terms' : 'Check back later for new signals'}
              </p>
            </div>
          ) : (
            <>
              {/* Live Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-white mb-1">{signals.length}</div>
                  <div className="text-xs text-white/40">Active Signals</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-red-400 mb-1">
                    {signals.filter(s => s.severity === 'critical').length}
                  </div>
                  <div className="text-xs text-white/40">Critical</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-blue-400 mb-1">
                    {signals.filter(s => s.type === 'emerging').length}
                  </div>
                  <div className="text-xs text-white/40">Emerging</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-green-400 mb-1">
                    {Math.round(signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length)}%
                  </div>
                  <div className="text-xs text-white/40">Avg Confidence</div>
                </div>
              </div>

              {/* Signals Grid */}
              <div className="space-y-4">
                {filteredSignals.map((signal) => {
                  const SeverityIcon = getSeverityIcon(signal.severity);
                  
                  return (
                    <div key={signal.id} className="group rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 hover:border-indigo-500/20 transition-all duration-300">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <SeverityIcon className={cn("w-5 h-5", getSeverityColor(signal.severity))} />
                          <div>
                            <span className={cn(
                              "px-3 py-1 rounded-full border text-xs font-medium mr-2",
                              getTypeColor(signal.type)
                            )}>
                              {signal.type.charAt(0).toUpperCase() + signal.type.slice(1)}
                            </span>
                            <span className={cn("text-xs font-medium", getSeverityColor(signal.severity))}>
                              {signal.severity.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <Clock size={12} />
                          {getTimeAgo(signal.detectedAt)}
                        </div>
                      </div>

                      <h3 className="font-display text-lg font-light text-white mb-2 group-hover:text-indigo-300/80 transition-colors">
                        {signal.title}
                      </h3>

                      <p className="text-sm text-white/40 leading-relaxed mb-4 line-clamp-2">
                        {signal.description}
                      </p>

                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4 text-xs text-white/40">
                          <span>Source: {signal.source}</span>
                          <span>Confidence: {signal.confidence}%</span>
                          <span>Impact: {signal.impact}</span>
                        </div>
                        
                        {signal.isPremium && (
                          <span className="px-2 py-1 rounded-full border border-yellow-500/20 bg-yellow-500/5 text-yellow-400 text-xs font-medium">
                            Premium
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1 mb-4">
                        {signal.keywords.map((keyword, index) => (
                          <span key={index} className="text-xs px-2 py-1 rounded-full border border-white/[0.1] text-white/50">
                            {keyword}
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => signal.isPremium ? setShowAuthModal(true) : router.push(`/signals/${signal.id}`)}
                          className="flex-1 py-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 font-medium hover:bg-indigo-500/10 transition-all"
                        >
                          <span className="flex items-center justify-center gap-2">
                            <Eye size={14} />
                            {signal.isPremium ? 'Unlock Details' : 'View Details'}
                          </span>
                        </button>
                        <button className="p-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.12] transition-all">
                          <Bell size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
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
