"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FileText, 
  TrendingUp, 
  Users, 
  ArrowRight, 
  AlertTriangle, 
  BookOpen, 
  Brain, 
  Shield, 
  Scale, 
  Leaf, 
  Calculator,
  Briefcase,
  Lock,
  BarChart3,
  Activity,
  Target,
  Settings,
  CreditCard,
  User,
  Calendar,
  Clock
} from 'lucide-react';
import HexResearcherAvatar from '@/components/HexResearcherAvatar';
import { RESEARCHERS } from '@/lib/researchers';
import { cn } from '@/lib/utils';
import FirstVisitBanner from '@/components/FirstVisitBanner';
import TrialBanner from '@/components/TrialBanner';

interface SubscriptionData {
  plan: 'TRIAL' | 'ANALYST' | 'EXECUTIVE' | 'RESEARCHER' | 'STRATEGY' | 'STUDIO';
  isTrialActive: boolean;
  trialDaysRemaining: number;
  trialExpired: boolean;
  canAccessBriefs: boolean;
  canAccessStudio: boolean;
  canCreateVerticals: boolean;
  canExportPdf: boolean;
  canCommissionBriefs: boolean;
  weeklyLimit: number;
  studioLimit: number;
  weeklyUsed: number;
  studioUsed: number;
  weeklyLimitReached: boolean;
  studioLimitReached: boolean;
}

type BriefType = 'RESEARCH_BRIEF' | 'UPDATE_NOTE' | 'DATA_NOTE' | 'POLICY_NOTE' | 'DOSSIER'
  | 'SUMMARY_BRIEF' | 'EXECUTIVE_BRIEF' | 'STRATEGIC_REPORT';

function briefTypeLabel(type: BriefType): string {
  switch (type) {
    case 'RESEARCH_BRIEF': return 'Executive Brief';
    case 'UPDATE_NOTE':    return 'Update Note';
    case 'DATA_NOTE':      return 'Data Note';
    case 'POLICY_NOTE':    return 'Policy Brief';
    case 'DOSSIER':        return 'Strategic Dossier';
    case 'STRATEGIC_REPORT': return 'Strategic Report';
    case 'EXECUTIVE_BRIEF':  return 'Executive Brief';
    default:               return 'Summary Brief';
  }
}

interface BriefData {
  id: string;
  title: string;
  type: BriefType;
  publishedAt: string;
  readTime: number;
  trending?: boolean;
  critical?: boolean;
}

interface ResearcherStatus {
  name: string;
  status: string;
  initials: string;
  researcher?: any;
  [key: string]: any;
}

interface UserStats {
  totalBriefs: number;
  weeklyBriefs: number;
  totalReadingTime: number;
  favoriteTopics: string[];
  lastActive: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentBriefs, setRecentBriefs] = useState<BriefData[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [researcherStatus, setResearcherStatus] = useState<ResearcherStatus[]>([]);
  const [showFirstVisit, setShowFirstVisit] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [subscriptionRes, briefsRes, statsRes] = await Promise.all([
        fetch('/api/subscription/status'),
        fetch('/api/user/briefs/recent'),
        fetch('/api/user/stats')
      ]);

      const subscriptionData = await subscriptionRes.json();
      const briefsData = await briefsRes.json();
      const statsData = await statsRes.json();

      setSubscription(subscriptionData);
      setRecentBriefs(briefsData.briefs || []);
      setUserStats(statsData);

      // Check if first visit
      const hasVisited = localStorage.getItem('hasVisitedDashboard');
      if (!hasVisited) {
        setShowFirstVisit(true);
        localStorage.setItem('hasVisitedDashboard', 'true');
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchResearcherStatus = async () => {
    try {
      const response = await fetch('/api/researchers/status');
      if (response.ok) {
        const data = await response.json();
        
        // Enhance with researcher data
        const enhancedStatus = data.map((status: any) => {
          const researcher = RESEARCHERS.find(r => 
            r.name.toLowerCase().includes(status.name.toLowerCase().split(' ')[1]) ||
            status.name.toLowerCase().includes(r.name.toLowerCase().split(' ')[1])
          );
          
          return {
            ...status,
            researcher: researcher || null,
            initials: researcher?.initials || status.initials
          };
        });
        
        setResearcherStatus(enhancedStatus);
      }
    } catch (error) {
      console.error('Failed to fetch researcher status:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/10 blur-xl" />
            <div className="relative w-full h-full rounded-full bg-[#0C0C12] border border-white/10 flex items-center justify-center">
              <span className="font-display text-2xl font-light nx-gradient-text">N</span>
            </div>
          </div>
          <div className="w-8 h-8 mx-auto border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-center text-white/50">Error loading dashboard</div>
      </div>
    );
  }

  // ANALYST / TRIAL Dashboard (free tier)
  if (subscription.plan === 'TRIAL' || subscription.plan === 'ANALYST') {
    return <AnalystDashboard subscription={subscription} recentBriefs={recentBriefs} router={router} />;
  }

  // RESEARCHER Dashboard (was EXECUTIVE)
  if (subscription.plan === 'RESEARCHER' || subscription.plan === 'EXECUTIVE') {
    return <ResearcherDashboard subscription={subscription} recentBriefs={recentBriefs} researcherStatus={researcherStatus} router={router} />;
  }

  // STUDIO Dashboard (was STRATEGY)
  if (subscription.plan === 'STUDIO' || subscription.plan === 'STRATEGY') {
    return <StudioDashboard subscription={subscription} recentBriefs={recentBriefs} researcherStatus={researcherStatus} router={router} />;
  }

  return null;
}

// ANALYST Dashboard - Free tier, read auto-published output
function AnalystDashboard({ subscription, recentBriefs, router }: { 
  subscription: SubscriptionData; 
  recentBriefs: BriefData[]; 
  router: any;
}) {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[900px]">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.06] via-violet-500/[0.03] to-transparent blur-3xl" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <FirstVisitBanner />
        
        {/* Trial Banner - only show if trial is active */}
        {subscription.isTrialActive && (
          <TrialBanner 
            daysRemaining={subscription.trialDaysRemaining}
            onDismiss={() => {
              // Optional: handle dismiss if needed
            }}
          />
        )}
        
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-3xl font-light text-white mb-2">
                Welcome to <span className="nx-gradient-text">NomosX</span>
              </h1>
              <p className="text-white/40">Discover strategic intelligence from our autonomous think tank</p>
            </div>
            <div className="px-4 py-2 rounded-full border border-emerald-400/20 bg-emerald-400/5">
              <span className="text-emerald-400 text-sm font-medium">ANALYST</span>
            </div>
          </div>
        </div>

        {/* Upgrade Hero */}
        <div className="relative overflow-hidden mb-12">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-purple-500/10 rounded-3xl blur-2xl" />
          
          <div className="relative text-center p-12 sm:p-16 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.02] to-white/[0.01]">
            <div className="text-xs text-indigo-400/50 tracking-wider uppercase mb-6">
              UNLOCK STRATEGIC INTELLIGENCE
            </div>
            
            <h2 className="font-display text-3xl sm:text-4xl font-light leading-tight mb-6">
              <span className="nx-gradient-text">Commission your own research.</span>
              <br />
              <span className="text-white/50 text-2xl sm:text-3xl">Go beyond reading. Start directing.</span>
            </h2>
            
            <p className="text-base text-white/40 mb-8 max-w-2xl mx-auto">
              As an Analyst you receive the auto-published output. Upgrade to Researcher to commission briefs, 
              run strategic reports, and access the Harvard Council deliberations.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <button
                onClick={() => router.push('/pricing')}
                className="group px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 text-white font-medium hover:border-indigo-500/40 transition-all shadow-[0_0_30px_rgba(99,102,241,0.15)]"
              >
                <span className="flex items-center justify-center gap-2">
                  Get Full Access
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </span>
              </button>
              <button
                onClick={() => router.push('/briefs')}
                className="px-8 py-4 rounded-xl border border-white/[0.1] text-white/70 hover:text-white hover:border-white/[0.2] hover:bg-white/[0.03] transition-all"
              >
                Browse Briefs
              </button>
            </div>
            
            <div className="flex items-center justify-center gap-6 text-xs text-white/40">
              <span>Researcher: €19/month</span>
              <div className="w-1 h-1 rounded-full bg-indigo-400/40" />
              <span>Studio: €49/month</span>
              <div className="w-1 h-1 rounded-full bg-indigo-400/40" />
              <span>30-day free trial</span>
            </div>
          </div>
        </div>

        {/* Recent Briefs Preview */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-2xl font-light text-white">
              Latest <span className="nx-gradient-text">Strategic Insights</span>
            </h2>
            <button
              onClick={() => router.push('/briefs')}
              className="text-indigo-400 hover:text-indigo-400/80 transition-colors text-sm"
            >
              View all →
            </button>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentBriefs.slice(0, 6).map((brief) => (
              <div key={brief.id} className="group rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 hover:border-indigo-500/20 transition-all duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                  <span className="text-xs text-indigo-400/60 uppercase tracking-wider">
                    {briefTypeLabel(brief.type)}
                  </span>
                  {brief.trending && (
                    <TrendingUp size={12} className="text-orange-400" />
                  )}
                </div>
                
                <h3 className="font-display text-lg font-light text-white/90 mb-3 line-clamp-2 group-hover:text-indigo-300/80 transition-colors">
                  {brief.title}
                </h3>
                
                <div className="flex items-center justify-between text-xs text-white/30 mb-4">
                  <span>{new Date(brief.publishedAt).toLocaleDateString()}</span>
                  <span>{brief.readTime} min read</span>
                </div>
                
                <button
                  onClick={() => router.push('/pricing')}
                  className="w-full py-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 font-medium hover:bg-indigo-500/10 transition-all"
                >
                  Unlock full brief
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Value Proposition */}
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: FileText,
              title: "Executive Briefs",
              description: "2-3 page decision-ready analyses with key findings and recommendations",
              locked: false
            },
            {
              icon: Brain,
              title: "Strategic Reports", 
              description: "10-15 page deep analysis with scenario planning and implementation roadmap",
              locked: true
            },
            {
              icon: Briefcase,
              title: "Studio Research",
              description: "Ask questions, get custom analysis from our Harvard Council",
              locked: true
            }
          ].map((feature, index) => (
            <div key={index} className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  feature.locked ? "bg-white/[0.05]" : "bg-indigo-500/10"
                )}>
                  <feature.icon size={20} className={cn(
                    feature.locked ? "text-white/30" : "text-indigo-400"
                  )} />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-white/90 mb-2 flex items-center gap-2">
                    {feature.title}
                    {feature.locked && <Lock size={14} className="text-white/30" />}
                  </h3>
                  <p className="text-sm text-white/40 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
              
              {feature.locked && (
                <button
                  onClick={() => router.push('/pricing')}
                  className="w-full py-2 rounded-lg border border-white/[0.1] text-white/50 hover:text-white hover:border-white/[0.2] transition-all text-sm"
                >
                  Upgrade to unlock
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// RESEARCHER Dashboard - Commission briefs + strategic reports
function ResearcherDashboard({ subscription, recentBriefs, researcherStatus, router }: { 
  subscription: SubscriptionData; 
  recentBriefs: BriefData[];
  researcherStatus: ResearcherStatus[];
  router: any;
}) {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[900px]">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.06] via-violet-500/[0.03] to-transparent blur-3xl" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-light text-white mb-2">
              Strategic <span className="nx-gradient-text">Intelligence</span>
            </h1>
            <p className="text-white/40">Executive briefs and strategic insights from our autonomous think tank</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 rounded-full border border-indigo-500/20 bg-indigo-500/10">
              <span className="text-indigo-300 text-sm font-medium">RESEARCHER</span>
            </div>
            <button
              onClick={() => router.push('/pricing')}
              className="px-4 py-2 rounded-xl border border-white/[0.1] text-white/70 hover:text-white hover:border-white/[0.2] hover:bg-white/[0.03] transition-all flex items-center gap-2"
            >
              <Lock size={14} />
              <span className="text-sm">Upgrade to Studio</span>
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Briefs Available", value: "Unlimited", icon: FileText },
            { label: "Weekly Usage", value: `${subscription.weeklyUsed}/∞`, icon: BarChart3 },
            { label: "Research Sources", value: "250M+", icon: Brain },
            { label: "Council Members", value: "8", icon: Users },
          ].map((stat, index) => (
            <div key={index} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="flex items-center gap-3 mb-2">
                <stat.icon size={16} className="text-indigo-400/60" />
                <span className="text-xs text-white/40">{stat.label}</span>
              </div>
              <div className="text-lg font-light text-white/90">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Briefs */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-light text-white">
                Latest <span className="nx-gradient-text">Executive Briefs</span>
              </h2>
              <button
                onClick={() => router.push('/briefs')}
                className="text-indigo-400 hover:text-indigo-400/80 transition-colors text-sm"
              >
                View all →
              </button>
            </div>
            
            <div className="space-y-4">
              {recentBriefs.map((brief) => (
                <div key={brief.id} className="group rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 hover:border-indigo-500/20 transition-all duration-300">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                        <span className="text-xs text-indigo-400/60 uppercase tracking-wider">
                          {briefTypeLabel(brief.type)}
                        </span>
                        {brief.trending && <TrendingUp size={12} className="text-orange-400" />}
                        {brief.critical && <AlertTriangle size={12} className="text-red-400" />}
                      </div>
                      
                      <h3 className="font-display text-xl font-light text-white/90 mb-3 group-hover:text-indigo-300/80 transition-colors">
                        {brief.title}
                      </h3>
                      
                      <div className="flex items-center gap-4 text-xs text-white/30">
                        <span>{new Date(brief.publishedAt).toLocaleDateString()}</span>
                        <span>{brief.readTime} min read</span>
                        <span>Full access</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => router.push(`/briefs/${brief.id}`)}
                      className="px-4 py-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 font-medium hover:bg-indigo-500/10 transition-all"
                    >
                      Read Brief
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Research Council Status */}
          <div>
            <h2 className="font-display text-2xl font-light text-white mb-6">
              Research <span className="nx-gradient-text">Council</span>
            </h2>
            
            <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6">
              <div className="space-y-4">
                {researcherStatus.slice(0, 4).map((researcher) => (
                  <div key={researcher.id} className="flex items-center gap-3">
                    {researcher.researcher ? (
                      <HexResearcherAvatar
                        researcher={researcher.researcher}
                        size="md"
                        showStatus={true}
                        status={researcher.status as any}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <span className="text-xs font-medium text-indigo-300">{researcher.initials}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white/90 truncate">{researcher.name}</span>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          researcher.status === 'analyzing' ? "bg-green-400" :
                          researcher.status === 'debating' ? "bg-yellow-400" :
                          researcher.status === 'synthesizing' ? "bg-indigo-400" :
                          "bg-white/30"
                        )} />
                      </div>
                      <div className="text-xs text-white/40 truncate">{researcher.currentTask}</div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-6 border-t border-white/[0.08]">
                <div className="text-center">
                  <p className="text-xs text-white/40 mb-3">Council analyzing emerging trends</p>
                  <div className="flex items-center justify-center gap-2">
                    <Activity size={12} className="text-indigo-400" />
                    <span className="text-xs text-indigo-400">Live analysis in progress</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Upgrade Prompt */}
            <div className="mt-6 rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.04] to-violet-500/[0.02] p-6">
              <div className="text-center">
                <Briefcase size={24} className="text-indigo-400 mx-auto mb-3" />
                <h3 className="font-display text-lg font-light text-white mb-2">
                  Need Custom Research?
                </h3>
                <p className="text-sm text-white/40 mb-4">
                  Upgrade to Studio for Publications Studio, Council Sessions, and API access
                </p>
                <button
                  onClick={() => router.push('/pricing')}
                  className="w-full py-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 font-medium hover:bg-indigo-500/10 transition-all"
                >
                  Upgrade to Studio
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// STUDIO Dashboard - Full access + Publications Studio
function StudioDashboard({ subscription, recentBriefs, researcherStatus, router }: { 
  subscription: SubscriptionData; 
  recentBriefs: BriefData[];
  researcherStatus: ResearcherStatus[];
  router: any;
}) {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1400px] h-[900px]">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/[0.06] via-violet-500/[0.03] to-transparent blur-3xl" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-light text-white mb-2">
              Strategic <span className="nx-gradient-text">Command Center</span>
            </h1>
            <p className="text-white/40">Your personal research council and strategic intelligence hub</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 rounded-full border border-violet-500/20 bg-violet-500/10">
              <span className="text-violet-300 text-sm font-medium">STUDIO</span>
            </div>
            <button
              onClick={() => router.push('/studio')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-400/20 to-pink-400/20 border border-purple-400/20 text-purple-400 font-medium hover:border-purple-400/40 transition-all flex items-center gap-2"
            >
              <Brain size={14} />
              <span className="text-sm">Open Studio</span>
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Studio Questions", value: `${subscription.studioUsed}/∞`, icon: Brain },
            { label: "Briefs Available", value: "Unlimited", icon: FileText },
            { label: "Custom Verticals", value: "Unlimited", icon: Scale },
            { label: "Council Access", value: "Full", icon: Users },
          ].map((stat, index) => (
            <div key={index} className="rounded-xl border border-purple-400/20 bg-purple-400/5 p-4">
              <div className="flex items-center gap-3 mb-2">
                <stat.icon size={16} className="text-purple-400/60" />
                <span className="text-xs text-white/40">{stat.label}</span>
              </div>
              <div className="text-lg font-light text-white/90">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Briefs */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-light text-white">
                Latest <span className="nx-gradient-text">Strategic Intelligence</span>
              </h2>
              <button
                onClick={() => router.push('/briefs')}
                className="text-purple-400 hover:text-purple-400/80 transition-colors text-sm"
              >
                View all →
              </button>
            </div>
            
            <div className="space-y-4">
              {recentBriefs.map((brief) => (
                <div key={brief.id} className="group rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-400/[0.04] to-pink-400/[0.02] p-6 hover:border-purple-400/40 transition-all duration-300">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                        <span className="text-xs text-purple-400/80 uppercase tracking-wider">
                          {briefTypeLabel(brief.type)}
                        </span>
                        {brief.trending && <TrendingUp size={12} className="text-orange-400" />}
                        {brief.critical && <AlertTriangle size={12} className="text-red-400" />}
                      </div>
                      
                      <h3 className="font-display text-xl font-light text-white/90 mb-3 group-hover:text-purple-400/80 transition-colors">
                        {brief.title}
                      </h3>
                      
                      <div className="flex items-center gap-4 text-xs text-white/30">
                        <span>{new Date(brief.publishedAt).toLocaleDateString()}</span>
                        <span>{brief.readTime} min read</span>
                        <span className="text-purple-400">Premium access</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => router.push(`/briefs/${brief.id}`)}
                      className="px-4 py-2 rounded-lg border border-purple-400/20 bg-purple-400/5 text-purple-400 font-medium hover:bg-purple-400/10 transition-all"
                    >
                      Read Brief
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Research Council & Studio */}
          <div>
            <h2 className="font-display text-2xl font-light text-white mb-6">
              Research <span className="nx-gradient-text">Council</span>
            </h2>
            
            <div className="rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-400/[0.04] to-pink-400/[0.02] p-6 mb-6">
              <div className="space-y-4">
                {researcherStatus.map((researcher) => (
                  <div key={researcher.id} className="flex items-center gap-3">
                    {researcher.researcher ? (
                      <HexResearcherAvatar
                        researcher={researcher.researcher}
                        size="md"
                        showStatus={true}
                        status={researcher.status as any}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-purple-400/10 border border-purple-400/20 flex items-center justify-center">
                        <span className="text-xs font-medium text-purple-400">{researcher.initials}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white/90 truncate">{researcher.name}</span>
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          researcher.status === 'analyzing' ? "bg-green-400" :
                          researcher.status === 'debating' ? "bg-orange-400" :
                          researcher.status === 'synthesizing' ? "bg-indigo-400" :
                          "bg-white/30"
                        )} />
                      </div>
                      <div className="text-xs text-white/40 truncate">
                        {researcher.currentTask || researcher.domain}
                      </div>
                      {researcher.progress && (
                        <div className="mt-1 w-full bg-white/[0.1] rounded-full h-1">
                          <div 
                            className="bg-purple-400 h-1 rounded-full transition-all duration-300"
                            style={{ width: `${researcher.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-6 border-t border-purple-400/20">
                <div className="text-center">
                  <p className="text-xs text-white/40 mb-3">Council analyzing your industry</p>
                  <div className="flex items-center justify-center gap-2">
                    <Activity size={12} className="text-purple-400" />
                    <span className="text-xs text-purple-400">Live analysis in progress</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Studio Quick Access */}
            <div className="rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-400/[0.04] to-pink-400/[0.02] p-6">
              <div className="text-center">
                <Brain size={32} className="text-purple-400 mx-auto mb-3" />
                <h3 className="font-display text-lg font-light text-white mb-2">
                  Research Studio
                </h3>
                <p className="text-sm text-white/40 mb-4">
                  Ask questions, get custom analysis from your personal research council
                </p>
                <button
                  onClick={() => router.push('/studio')}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-400/20 to-pink-400/20 border border-purple-400/20 text-purple-400 font-medium hover:border-purple-400/40 transition-all"
                >
                  Open Studio
                </button>
                <div className="mt-3 text-xs text-purple-400/60">
                  {subscription.studioLimit === -1 ? 'Unlimited questions' : `${subscription.studioLimit - subscription.studioUsed} questions remaining`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
