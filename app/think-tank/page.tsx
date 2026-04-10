"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Users, TrendingUp, Activity, Clock, Filter, Search, ArrowRight, BookOpen, Award, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import AuthModal from '@/components/AuthModal';

interface Researcher {
  id: string;
  name: string;
  title: string;
  domain: string;
  status: 'analyzing' | 'debating' | 'synthesizing' | 'idle';
  currentTask?: string;
  expertise: string[];
  publications: number;
  accuracy: number;
  avatar: string;
}

interface ThinkTankMetric {
  totalResearchers: number;
  activeProjects: number;
  weeklyOutput: number;
  avgAccuracy: number;
  domains: string[];
}

export default function ThinkTankPage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [metrics, setMetrics] = useState<ThinkTankMetric | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDomain, setFilterDomain] = useState<'all' | string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'analyzing' | 'debating' | 'synthesizing' | 'idle'>('all');

  useEffect(() => {
    fetchThinkTankData();
  }, []);

  const fetchThinkTankData = async () => {
    setLoading(true);
    try {
      // Simuler des données du think tank
      const mockResearchers: Researcher[] = [
        {
          id: '1',
          name: 'Dr. Sarah Chen',
          title: 'AI Ethics Researcher',
          domain: 'Technology',
          status: 'analyzing',
          currentTask: 'Analyzing AI governance frameworks',
          expertise: ['AI Ethics', 'Machine Learning', 'Policy'],
          publications: 47,
          accuracy: 94,
          avatar: 'SC'
        },
        {
          id: '2',
          name: 'Prof. Michael Roberts',
          title: 'Climate Economics Expert',
          domain: 'Environment',
          status: 'debating',
          currentTask: 'Debating carbon pricing models',
          expertise: ['Climate Economics', 'Policy Analysis', 'Sustainability'],
          publications: 62,
          accuracy: 91,
          avatar: 'MR'
        },
        {
          id: '3',
          name: 'Dr. Elena Rodriguez',
          title: 'Geopolitical Analyst',
          domain: 'International Relations',
          status: 'synthesizing',
          currentTask: 'Synthesizing trade war implications',
          expertise: ['Geopolitics', 'Trade Policy', 'International Law'],
          publications: 38,
          accuracy: 89,
          avatar: 'ER'
        },
        {
          id: '4',
          name: 'Prof. James Kim',
          title: 'Healthcare Policy Specialist',
          domain: 'Healthcare',
          status: 'idle',
          expertise: ['Healthcare Policy', 'Public Health', 'Medical Ethics'],
          publications: 55,
          accuracy: 92,
          avatar: 'JK'
        },
        {
          id: '5',
          name: 'Dr. Amara Okonkwo',
          title: 'Financial Markets Expert',
          domain: 'Finance',
          status: 'analyzing',
          currentTask: 'Analyzing cryptocurrency regulations',
          expertise: ['Financial Markets', 'Cryptocurrency', 'Risk Management'],
          publications: 41,
          accuracy: 87,
          avatar: 'AO'
        },
        {
          id: '6',
          name: 'Prof. David Schmidt',
          title: 'Energy Transition Researcher',
          domain: 'Energy',
          status: 'debating',
          currentTask: 'Debating renewable energy policies',
          expertise: ['Energy Policy', 'Renewable Energy', 'Sustainability'],
          publications: 53,
          accuracy: 90,
          avatar: 'DS'
        }
      ];

      const mockMetrics: ThinkTankMetric = {
        totalResearchers: 6,
        activeProjects: 12,
        weeklyOutput: 24,
        avgAccuracy: 91,
        domains: ['Technology', 'Environment', 'International Relations', 'Healthcare', 'Finance', 'Energy']
      };

      setResearchers(mockResearchers);
      setMetrics(mockMetrics);
    } catch (error) {
      console.error('Failed to fetch think tank data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredResearchers = researchers.filter(researcher => {
    const matchesSearch = !searchTerm || 
      researcher.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      researcher.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      researcher.expertise.some(exp => exp.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesDomain = filterDomain === 'all' || researcher.domain === filterDomain;
    const matchesStatus = filterStatus === 'all' || researcher.status === filterStatus;
    
    return matchesSearch && matchesDomain && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'analyzing': return 'text-blue-400 border-blue-400/20 bg-blue-400/5';
      case 'debating': return 'text-purple-400 border-purple-400/20 bg-purple-400/5';
      case 'synthesizing': return 'text-green-400 border-green-400/20 bg-green-400/5';
      case 'idle': return 'text-gray-400 border-gray-400/20 bg-gray-400/5';
      default: return 'text-gray-400 border-gray-400/20 bg-gray-400/5';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'analyzing': return Brain;
      case 'debating': return Users;
      case 'synthesizing': return Target;
      case 'idle': return Activity;
      default: return Activity;
    }
  };

  const getDomainColor = (domain: string) => {
    const colors: Record<string, string> = {
      'Technology': 'text-blue-400',
      'Environment': 'text-green-400',
      'International Relations': 'text-purple-400',
      'Healthcare': 'text-red-400',
      'Finance': 'text-yellow-400',
      'Energy': 'text-orange-400'
    };
    return colors[domain] || 'text-gray-400';
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
              <div className="flex items-center justify-center gap-3 mb-4">
                <Brain className="w-8 h-8 text-indigo-400" />
                <h1 className="font-display text-4xl font-light text-white">
                  Autonomous <span className="nx-gradient-text">Think Tank</span>
                </h1>
              </div>
              <p className="text-white/40 max-w-2xl mx-auto">
                Our team of AI-powered researchers continuously analyzes global trends, 
                debates critical issues, and synthesizes strategic insights for decision-makers.
              </p>
            </div>

            {/* Metrics */}
            {metrics && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-white mb-1">{metrics.totalResearchers}</div>
                  <div className="text-xs text-white/40">Researchers</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-indigo-400 mb-1">{metrics.activeProjects}</div>
                  <div className="text-xs text-white/40">Active Projects</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-green-400 mb-1">{metrics.weeklyOutput}</div>
                  <div className="text-xs text-white/40">Weekly Output</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-yellow-400 mb-1">{metrics.avgAccuracy}%</div>
                  <div className="text-xs text-white/40">Avg Accuracy</div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] text-center">
                  <div className="text-2xl font-light text-purple-400 mb-1">{metrics.domains.length}</div>
                  <div className="text-xs text-white/40">Domains</div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search researchers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white placeholder-white/40 focus:border-indigo-500/40 focus:outline-none transition-all"
                />
              </div>
              
              <div className="flex gap-2">
                <select
                  value={filterDomain}
                  onChange={(e) => setFilterDomain(e.target.value)}
                  className="px-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white focus:border-indigo-500/40 focus:outline-none transition-all"
                >
                  <option value="all">All Domains</option>
                  {metrics?.domains.map(domain => (
                    <option key={domain} value={domain}>{domain}</option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white focus:border-indigo-500/40 focus:outline-none transition-all"
                >
                  <option value="all">All Status</option>
                  <option value="analyzing">Analyzing</option>
                  <option value="debating">Debating</option>
                  <option value="synthesizing">Synthesizing</option>
                  <option value="idle">Idle</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="flex items-center gap-3 text-white/40">
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span>Loading think tank...</span>
              </div>
            </div>
          ) : filteredResearchers.length === 0 ? (
            <div className="text-center py-16">
              <Brain className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">No researchers found</h3>
              <p className="text-white/40">
                {searchTerm ? 'Try adjusting your search terms' : 'All researchers are currently offline'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {filteredResearchers.map((researcher) => {
                  const StatusIcon = getStatusIcon(researcher.status);
                  
                  return (
                    <div key={researcher.id} className="group rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 hover:border-indigo-500/20 transition-all duration-300">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full border border-indigo-500/20 bg-indigo-500/5 flex items-center justify-center">
                            <span className="text-indigo-300 font-mono text-sm">{researcher.avatar}</span>
                          </div>
                          <div>
                            <h3 className="font-display text-lg font-light text-white group-hover:text-indigo-300/80 transition-colors">
                              {researcher.name}
                            </h3>
                            <p className="text-sm text-white/60">{researcher.title}</p>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-2">
                          <span className={cn(
                            "px-2 py-1 rounded-full border text-xs font-medium flex items-center gap-1",
                            getStatusColor(researcher.status)
                          )}>
                            <StatusIcon size={10} />
                            {researcher.status}
                          </span>
                          <span className={cn("text-xs font-medium", getDomainColor(researcher.domain))}>
                            {researcher.domain}
                          </span>
                        </div>
                      </div>

                      {/* Current Task */}
                      {researcher.currentTask && (
                        <div className="mb-4 p-3 rounded-lg border border-white/[0.05] bg-white/[0.02]">
                          <div className="flex items-center gap-2 text-xs text-white/40 mb-1">
                            <Clock size={10} />
                            Current Task
                          </div>
                          <p className="text-sm text-white/60">{researcher.currentTask}</p>
                        </div>
                      )}

                      {/* Expertise */}
                      <div className="mb-4">
                        <div className="text-xs text-white/40 mb-2">Expertise</div>
                        <div className="flex flex-wrap gap-1">
                          {researcher.expertise.slice(0, 3).map((exp, index) => (
                            <span key={index} className="text-xs px-2 py-1 rounded-full border border-white/[0.1] text-white/50">
                              {exp}
                            </span>
                          ))}
                          {researcher.expertise.length > 3 && (
                            <span className="text-xs px-2 py-1 rounded-full border border-white/[0.1] text-white/30">
                              +{researcher.expertise.length - 3}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center justify-between mb-4 text-xs text-white/40">
                        <div className="flex items-center gap-2">
                          <BookOpen size={12} />
                          {researcher.publications} papers
                        </div>
                        <div className="flex items-center gap-2">
                          <Target size={12} />
                          {researcher.accuracy}% accuracy
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowAuthModal(true)}
                          className="flex-1 py-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 font-medium hover:bg-indigo-500/10 transition-all"
                        >
                          View Profile
                        </button>
                        <button className="p-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.12] transition-all">
                          <Zap size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* CTA Section */}
              <div className="text-center py-12">
                <div className="max-w-2xl mx-auto">
                  <Award className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
                  <h2 className="font-display text-2xl font-light text-white mb-4">
                    Access Our Research Council
                  </h2>
                  <p className="text-white/40 mb-6">
                    Get exclusive access to our Harvard Council deliberations, expert debates, 
                    and strategic insights. Subscribe to unlock premium research capabilities.
                  </p>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-medium hover:from-indigo-600 hover:to-violet-600 transition-all"
                  >
                    Subscribe for Premium Access
                  </button>
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
