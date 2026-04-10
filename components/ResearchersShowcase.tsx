"use client";

import React, { useState, useEffect } from 'react';
import { Researcher, getResearcherCount, getResearchersByTier, getTopResearchersByCitations } from '@/lib/researchers';
import ResearcherCarousel from './ResearcherCarousel';
import { Users, Award, TrendingUp, Filter } from 'lucide-react';

interface ResearchersShowcaseProps {
  tier?: 'standard' | 'premium' | 'strategic' | 'enterprise';
  showAll?: boolean;
  autoPlay?: boolean;
  className?: string;
}

export default function ResearchersShowcase({
  tier = 'strategic',
  showAll = true,
  autoPlay = true,
  className = ''
}: ResearchersShowcaseProps) {
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [filter, setFilter] = useState<'all' | 'top-cited' | 'core' | 'advanced' | 'specialized'>('all');
  const [stats, setStats] = useState({
    total: 0,
    core: 0,
    advanced: 0,
    specialized: 0,
    avgCitations: 0,
    topCited: 0
  });

  useEffect(() => {
    // Load researchers based on filter
    let filteredResearchers: Researcher[] = [];
    
    switch (filter) {
      case 'top-cited':
        filteredResearchers = getTopResearchersByCitations(10);
        break;
      case 'core':
        filteredResearchers = getResearchersByTier('standard');
        break;
      case 'advanced':
        filteredResearchers = getResearchersByTier('premium');
        break;
      case 'specialized':
        filteredResearchers = getResearchersByTier('strategic');
        break;
      default:
        filteredResearchers = getResearchersByTier(tier);
    }

    setResearchers(filteredResearchers);

    // Calculate stats
    const allResearchers = getResearchersByTier('strategic');
    setStats({
      total: allResearchers.length,
      core: allResearchers.filter(r => r.tier === 'core').length,
      advanced: allResearchers.filter(r => r.tier === 'advanced').length,
      specialized: allResearchers.filter(r => r.tier === 'specialized').length,
      avgCitations: Math.round(
        allResearchers.reduce((sum, r) => sum + (r.citationCount || 0), 0) / allResearchers.length
      ),
      topCited: getTopResearchersByCitations(5).length
    });
  }, [tier, filter]);

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
  };

  return (
    <div className={`space-y-8 ${className}`}>
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
          <Users className="w-4 h-4 text-indigo-400" />
          <span className="text-white font-medium">
            {stats.total} PhD Researchers
          </span>
        </div>
        
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
          <span className="nx-gradient-text">World-Class Expert Council</span>
        </h2>
        
        <p className="text-white/60 max-w-2xl mx-auto">
          {filter === 'top-cited' 
            ? 'Most influential researchers by citation impact'
            : filter === 'core'
            ? 'Core domain experts forming our foundation'
            : filter === 'advanced'
            ? 'Advanced specialists extending our capabilities'
            : filter === 'specialized'
            ? 'Specialized experts for cutting-edge research'
            : 'Complete council covering all research domains'
          }
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <span className="text-white/70 text-sm">Total</span>
          </div>
          <p className="text-white text-2xl font-bold">{stats.total}</p>
        </div>
        
        <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Award className="w-4 h-4 text-purple-400" />
            <span className="text-white/70 text-sm">Core</span>
          </div>
          <p className="text-white text-2xl font-bold">{stats.core}</p>
        </div>
        
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span className="text-white/70 text-sm">Avg Citations</span>
          </div>
          <p className="text-white text-2xl font-bold">{stats.avgCitations.toLocaleString()}</p>
        </div>
        
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-emerald-400" />
            <span className="text-white/70 text-sm">Specialized</span>
          </div>
          <p className="text-white text-2xl font-bold">{stats.specialized}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap justify-center gap-2">
        {[
          { key: 'all', label: 'All Researchers', color: 'indigo' },
          { key: 'top-cited', label: 'Top Cited', color: 'amber' },
          { key: 'core', label: 'Core', color: 'purple' },
          { key: 'advanced', label: 'Advanced', color: 'blue' },
          { key: 'specialized', label: 'Specialized', color: 'emerald' }
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => handleFilterChange(key as typeof filter)}
            className={`px-4 py-2 rounded-full border transition-all duration-200 ${
              filter === key
                ? `bg-${color}-500/20 border-${color}-500 text-${color}-300`
                : 'border-white/20 text-white/60 hover:border-white/40 hover:text-white/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Researcher Carousel */}
      <div className="max-w-4xl mx-auto">
        <ResearcherCarousel
          researchers={researchers}
          autoPlay={autoPlay}
          speed={4000}
          showMetrics={true}
        />
      </div>

      {/* Footer Stats */}
      <div className="text-center space-y-2">
        <p className="text-white/50 text-sm">
          {filter === 'top-cited' 
            ? `Showing ${researchers.length} most cited researchers with ${stats.avgCitations.toLocaleString()} average citations`
            : `Displaying ${researchers.length} researchers (${stats.core} core, ${stats.advanced} advanced, ${stats.specialized} specialized)`
          }
        </p>
        <p className="text-white/30 text-xs">
          Phase 3 Expansion: 22+ domain experts covering 95%+ of academic research
        </p>
      </div>
    </div>
  );
}
