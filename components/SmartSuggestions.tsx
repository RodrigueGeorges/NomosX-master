
"use client";
import React from 'react';
import { useState,useEffect } from 'react';
/**
 * SmartSuggestions Component
 * 
 * Provides intelligent follow-up questions and related topics
 * Based on current analysis and user history
 */



interface Suggestion {
  id: string;
  text: string;
  type: 'follow_up' | 'related' | 'trend' | 'deep_dive';
  relevanceScore?: number;
}

interface SmartSuggestionsProps {
  analysisId?: string;
  currentQuestion?: string;
  onSelectSuggestion?: (suggestion: string) => void;
}

export default function SmartSuggestions({ analysisId, currentQuestion, onSelectSuggestion }: SmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (analysisId || currentQuestion) {
      loadSuggestions();
    }
  }, [analysisId, currentQuestion]);

  const loadSuggestions = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (analysisId) params.append('analysisId', analysisId);
      if (currentQuestion) params.append('question', currentQuestion);

      const response = await fetch(`/api/suggestions?${params}`);
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'follow_up':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'trend':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
          </svg>
        );
      case 'deep_dive':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'follow_up': return 'Follow-up';
      case 'related': return 'Related';
      case 'trend': return 'Trending';
      case 'deep_dive': return 'Deep Dive';
      default: return 'Question';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'follow_up': return 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20';
      case 'related': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      case 'trend': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'deep_dive': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      default: return 'text-neutral-400 bg-neutral-800 border-neutral-700';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 bg-neutral-900 rounded-xl border border-neutral-800">
        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-neutral-400">Loading suggestions...</span>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-400 flex items-center gap-2">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
        </svg>
        Suggestions for you
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => onSelectSuggestion?.(suggestion.text)}
            className={`p-4 rounded-xl border transition-all text-left group hover:scale-[1.02] ${getTypeColor(suggestion.type)}`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-current/10 rounded-lg">
                {getSuggestionIcon(suggestion.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium mb-1 opacity-75">
                  {getTypeLabel(suggestion.type)}
                </div>
                <p className="text-sm font-medium line-clamp-2">
                  {suggestion.text}
                </p>
              </div>

              <svg className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
