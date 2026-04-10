import React from 'react';
import { cn } from '@/lib/utils';
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Activity,
  Clock,
  BarChart3
} from 'lucide-react';

interface ResearcherProfile {
  id: string;
  name: string;
  initials: string;
  title: string;
  institution: string;
  domain: string;
  bio: string;
  recentWork: string;
  personality: string;
  quote: string;
  status: 'analyzing' | 'debating' | 'synthesizing' | 'idle';
  currentTask?: string;
  progress?: number;
  avatar?: {
    photoStyle: "professional" | "academic" | "thought-leader";
    background: "office" | "university" | "conference";
    mood: "focused" | "collaborative" | "strategic";
  };
}

interface ResearcherProfileCardProps {
  researcher: ResearcherProfile;
  showFullProfile?: boolean;
  tier?: 'TRIAL' | 'EXECUTIVE' | 'STRATEGY';
}

export default function ResearcherProfileCard({ 
  researcher, 
  showFullProfile = false, 
  tier = 'EXECUTIVE' 
}: ResearcherProfileCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'analyzing': return 'bg-green-400';
      case 'debating': return 'bg-orange-400';
      case 'synthesizing': return 'bg-blue-400';
      case 'idle': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'analyzing': return <Brain size={12} />;
      case 'debating': return <AlertTriangle size={12} />;
      case 'synthesizing': return <CheckCircle size={12} />;
      case 'idle': return <Clock size={12} />;
      default: return <Clock size={12} />;
    }
  };

  const isLimited = tier === 'TRIAL';

  return (
    <div className="group relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 hover:border-indigo-500/20 transition-all duration-300">
      {/* Status Indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <div className={cn(
          "w-2 h-2 rounded-full",
          getStatusColor(researcher.status)
        )} />
        <span className="text-xs text-white/40 capitalize">{researcher.status}</span>
      </div>

      {/* Avatar Section */}
      <div className="flex items-start gap-4 mb-6">
        <div className="relative">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 flex items-center justify-center">
            {researcher.avatar ? (
              <img 
                src={`/avatars/${researcher.id}.jpg`}
                alt={researcher.name}
                className="w-full h-full rounded-2xl object-cover"
              />
            ) : (
              <span className="text-lg font-semibold text-indigo-300">
                {researcher.initials}
              </span>
            )}
          </div>
          
          {/* Status Icon Overlay */}
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#09090b] border border-white/[0.1] flex items-center justify-center">
            {getStatusIcon(researcher.status)}
          </div>
        </div>

        {/* Basic Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg font-light text-white/90 mb-1">
            {researcher.name}
          </h3>
          <p className="text-sm text-white/50 mb-2">
            {researcher.title}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-indigo-300/80 font-medium">
              {researcher.domain}
            </span>
            <span className="text-xs text-white/30">•</span>
            <span className="text-xs text-white/30">
              {researcher.institution}
            </span>
          </div>
        </div>
      </div>

      {/* Full Profile (EXECUTIVE+) */}
      {!isLimited && showFullProfile && (
        <div className="space-y-4 mb-6">
          {/* Bio */}
          <p className="text-sm text-white/40 leading-relaxed">
            {researcher.bio}
          </p>

          {/* Recent Work */}
          <div>
            <h4 className="text-xs font-medium text-white/60 mb-2">Current Focus</h4>
            <p className="text-sm text-white/40">
              {researcher.recentWork}
            </p>
          </div>

          {/* Quote */}
          <div className="border-l-2 border-indigo-500/30 pl-4">
            <p className="text-sm text-white/50 italic">
              "{researcher.quote}"
            </p>
          </div>

          {/* Progress Bar */}
          {researcher.progress !== undefined && researcher.status !== 'idle' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/40">Current Analysis</span>
                <span className="text-xs text-indigo-400">{researcher.progress}%</span>
              </div>
              <div className="w-full bg-white/[0.1] rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${researcher.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Limited Info (TRIAL) */}
      {isLimited && (
        <div className="mb-6">
          <p className="text-sm text-white/40">
            {researcher.domain} expert focused on strategic analysis and research synthesis.
          </p>
        </div>
      )}

      {/* Current Task */}
      {!isLimited && researcher.currentTask && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-indigo-400" />
            <span className="text-xs font-medium text-indigo-400">Current Task</span>
          </div>
          <p className="text-sm text-white/40">
            {researcher.currentTask}
          </p>
        </div>
      )}

      {/* Upgrade Prompt (TRIAL) */}
      {isLimited && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
          <div className="text-center">
            <p className="text-xs text-indigo-300/80 mb-2">
              Full researcher profiles available in Executive tier
            </p>
            <button className="text-xs text-indigo-400 hover:text-indigo-400/80 transition-colors">
              Upgrade to unlock →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Interactive Council Room Component
interface CouncilRoomProps {
  researchers: ResearcherProfile[];
  tier?: 'TRIAL' | 'EXECUTIVE' | 'STRATEGY';
}

export function CouncilRoom({ researchers, tier = 'EXECUTIVE' }: CouncilRoomProps) {
  const activeResearchers = researchers.filter(r => r.status !== 'idle');
  const isLimited = tier === 'TRIAL';

  return (
    <div className="space-y-6">
      {/* Council Status */}
      <div className="text-center">
        <h3 className="font-display text-2xl font-light text-white mb-2">
          Research <span className="nx-gradient-text">Council</span>
        </h3>
        <p className="text-white/40">
          {activeResearchers.length} researchers currently analyzing strategic shifts
        </p>
      </div>

      {/* Researchers Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {researchers.slice(0, isLimited ? 4 : undefined).map((researcher) => (
          <ResearcherProfileCard
            key={researcher.id}
            researcher={researcher}
            showFullProfile={!isLimited}
            tier={tier}
          />
        ))}
      </div>

      {/* Live Discussion (STRATEGY only) */}
      {tier === 'STRATEGY' && (
        <div className="rounded-2xl border border-purple-400/20 bg-gradient-to-br from-purple-400/[0.04] to-pink-400/[0.02] p-6">
          <h4 className="font-display text-lg font-light text-white mb-4">
            Live <span className="text-purple-400">Council Discussion</span>
          </h4>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-400/10 border border-purple-400/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-medium text-purple-400">EV</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-white/80">
                  The Fed's latest policy suggests a more aggressive stance on tech regulation...
                </p>
                <span className="text-xs text-purple-400/60">Dr. Elena Vasquez • 2 min ago</span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-400/10 border border-orange-400/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-medium text-orange-400">JC</span>
              </div>
              <div className="flex-1">
                <p className="text-sm text-white/80">
                  But we need to consider the tech sector's lobbying power and historical resistance...
                </p>
                <span className="text-xs text-orange-400/60">Dr. James Chen • 1 min ago</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Prompt (TRIAL) */}
      {isLimited && (
        <div className="text-center py-8">
          <p className="text-white/40 mb-4">
            Want to see the full council in action?
          </p>
          <button className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 text-white font-medium hover:border-indigo-500/40 transition-all">
            Upgrade to Executive
          </button>
        </div>
      )}
    </div>
  );
}
