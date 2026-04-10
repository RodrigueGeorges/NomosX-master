
"use client";
import React from 'react';
import { useState,useEffect } from 'react';
/**
 * ConversationHistory Component
 * 
 * Displays list of previous analyses for easy access and context
 * Implements smart organization and search
 */


import TrustScoreBadge from './TrustScoreBadge';

interface Analysis {
  id: string;
  question: string;
  trustScore?: number;
  status: string;
  createdAt: string;
  claimCount?: number;
}

interface ConversationHistoryProps {
  userId?: string;
  onSelectAnalysis?: (analysisId: string) => void;
}

export default function ConversationHistory({ userId, onSelectAnalysis }: ConversationHistoryProps) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'completed' | 'recent'>('all');

  useEffect(() => {
    loadHistory();
  }, [userId, filter]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (filter !== 'all') params.append('filter', filter);

      const response = await fetch(`/api/analysis/history?${params}`);
      const data = await response.json();
      setAnalyses(data.analyses || []);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAnalyses = analyses.filter(analysis =>
    analysis.question.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-green-400';
      case 'RUNNING': return 'text-indigo-400';
      case 'FAILED': return 'text-red-400';
      default: return 'text-neutral-400';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">History</h2>
        <span className="text-sm text-neutral-500">{analyses.length} analyses</span>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
        />

        <div className="flex gap-2">
          {(['all', 'completed', 'recent'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Analysis List */}
      {filteredAnalyses.length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 text-neutral-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-neutral-500">
            {searchQuery ? 'No matching analyses found' : 'No conversation history yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAnalyses.map((analysis) => (
            <button
              key={analysis.id}
              onClick={() => onSelectAnalysis?.(analysis.id)}
              className="w-full p-4 bg-neutral-900 hover:bg-neutral-800 rounded-xl border border-neutral-800 hover:border-indigo-500/50 transition-all text-left group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium line-clamp-2 group-hover:text-indigo-300 transition-colors">
                    {analysis.question}
                  </p>
                  
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="text-neutral-500">{formatDate(analysis.createdAt)}</span>
                    <span className="text-neutral-700">•</span>
                    <span className={getStatusColor(analysis.status)}>
                      {analysis.status}
                    </span>
                    {analysis.claimCount !== undefined && (
                      <>
                        <span className="text-neutral-700">•</span>
                        <span className="text-neutral-500">{analysis.claimCount} claims</span>
                      </>
                    )}
                  </div>
                </div>

                {analysis.trustScore !== undefined && (
                  <TrustScoreBadge score={analysis.trustScore} size="sm" showLabel={false} />
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Load More */}
      {filteredAnalyses.length >= 20 && (
        <button className="w-full py-3 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
          Load more...
        </button>
      )}
    </div>
  );
}
