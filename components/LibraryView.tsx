
"use client";
import React from 'react';
import { useState,useEffect } from 'react';
/**
 * LibraryView Component
 * 
 * Organized view of saved analyses, briefs, and topics
 * Implements smart categorization and tagging
 */


import TrustScoreBadge from './TrustScoreBadge';

interface Brief {
  id: string;
  question: string;
  trustScore?: number;
  createdAt: string;
  kind: string;
  topicId?: string;
  topic?: {
    name: string;
    color?: string;
  };
}

interface Topic {
  id: string;
  name: string;
  query: string;
  briefCount: number;
  color?: string;
}

interface LibraryViewProps {
  userId?: string;
  onSelectBrief?: (briefId: string) => void;
}

export default function LibraryView({ userId, onSelectBrief }: LibraryViewProps) {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<'all' | 'topics'>('all');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'trust' | 'name'>('recent');

  useEffect(() => {
    loadLibrary();
  }, [userId, view, selectedTopic, sortBy]);

  const loadLibrary = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (selectedTopic) params.append('topicId', selectedTopic);
      params.append('sortBy', sortBy);

      const [briefsRes, topicsRes] = await Promise.all([
        fetch(`/api/library/briefs?${params}`),
        fetch(`/api/library/topics?${params}`),
      ]);

      const briefsData = await briefsRes.json();
      const topicsData = await topicsRes.json();

      setBriefs(briefsData.briefs || []);
      setTopics(topicsData.topics || []);
    } catch (error) {
      console.error('Failed to load library:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Library</h2>
          <p className="text-neutral-400 mt-1">{briefs.length} saved analyses</p>
        </div>

        {/* View Toggles */}
        <div className="flex gap-2">
          <button
            onClick={() => setView('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              view === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            All Briefs
          </button>
          <button
            onClick={() => setView('topics')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              view === 'topics'
                ? 'bg-indigo-600 text-white'
                : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            By Topics
          </button>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-neutral-500">Sort by:</span>
        <div className="flex gap-2">
          {(['recent', 'trust', 'name'] as const).map((sort) => (
            <button
              key={sort}
              onClick={() => setSortBy(sort)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortBy === sort
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {sort === 'recent' && 'Most Recent'}
              {sort === 'trust' && 'Highest Trust'}
              {sort === 'name' && 'Name'}
            </button>
          ))}
        </div>
      </div>

      {view === 'topics' && (
        <>
          {/* Topics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => setSelectedTopic(selectedTopic === topic.id ? null : topic.id)}
                className={`p-4 rounded-xl border transition-all text-left ${
                  selectedTopic === topic.id
                    ? 'bg-indigo-500/20 border-indigo-500'
                    : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="text-lg font-bold text-white mb-1">{topic.name}</div>
                <div className="text-sm text-neutral-400">{topic.briefCount} briefs</div>
              </button>
            ))}
          </div>

          {selectedTopic && (
            <button
              onClick={() => setSelectedTopic(null)}
              className="text-sm text-indigo-400 hover:underline"
            >
              ← Show all topics
            </button>
          )}
        </>
      )}

      {/* Briefs Grid */}
      {briefs.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-20 h-20 text-neutral-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-neutral-500">No briefs in your library yet</p>
          <p className="text-sm text-neutral-600 mt-2">Start a new analysis to create your first brief</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {briefs.map((brief) => (
            <button
              key={brief.id}
              onClick={() => onSelectBrief?.(brief.id)}
              className="p-5 bg-neutral-900 hover:bg-neutral-800 rounded-xl border border-neutral-800 hover:border-indigo-500/50 transition-all text-left group"
            >
              {/* Topic Tag */}
              {brief.topic && (
                <div className="mb-3">
                  <span className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-400 text-xs rounded-full">
                    {brief.topic.name}
                  </span>
                </div>
              )}

              {/* Question */}
              <h3 className="text-white font-semibold line-clamp-2 group-hover:text-indigo-300 transition-colors mb-3">
                {brief.question}
              </h3>

              {/* Metadata */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">
                  {formatDate(brief.createdAt)}
                </span>

                {brief.trustScore !== undefined && (
                  <TrustScoreBadge score={brief.trustScore} size="sm" showLabel={false} />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
