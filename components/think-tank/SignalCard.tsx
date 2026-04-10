"use client";
import React from 'react';

/**
 * SignalCard Component
 * 
 * Displays a signal with scores and status
 * Follows NomosX design system
 */

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Zap,TrendingUp,AlertTriangle,Database,FileText,Clock,ChevronRight } from 'lucide-react';

interface SignalCardProps {
  signal: {
    id: string;
    verticalId: string;
    vertical: {
      id: string;
      slug: string;
      name: string;
      icon?: string;
      color?: string;
    };
    signalType: string;
    title: string;
    summary: string;
    scores: {
      novelty: number;
      impact: number;
      confidence: number;
      urgency: number;
      priority: number;
    };
    status: string;
    sourceCount: number;
    detectedAt: string;
  };
  compact?: boolean;
}

const SIGNAL_TYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  NEW_EVIDENCE: { icon: Zap, label: "New Evidence", color: "#818cf8" },
  CONTRADICTION: { icon: AlertTriangle, label: "Contradiction", color: "#F59E0B" },
  TREND_BREAK: { icon: TrendingUp, label: "Trend Break", color: "#8B5CF6" },
  DATA_RELEASE: { icon: Database, label: "Data Release", color: "#10B981" },
  POLICY_CHANGE: { icon: FileText, label: "Policy Change", color: "#3B82F6" },
  METHODOLOGY_SHIFT: { icon: Zap, label: "Methodology Shift", color: "#EC4899" }
};

const STATUS_CONFIG: Record<string, { variant: "default" | "success" | "warning" | "error" | "ai"; label: string }> = {
  NEW: { variant: "ai", label: "New" },
  HELD: { variant: "warning", label: "Held" },
  PUBLISHED: { variant: "success", label: "Published" },
  REJECTED: { variant: "error", label: "Rejected" },
  EXPIRED: { variant: "default", label: "Expired" }
};

export default function SignalCard({ signal, compact = false }: SignalCardProps) {
  const typeConfig = SIGNAL_TYPE_CONFIG[signal.signalType] || SIGNAL_TYPE_CONFIG.NEW_EVIDENCE;
  const statusConfig = STATUS_CONFIG[signal.status] || STATUS_CONFIG.NEW;
  const TypeIcon = typeConfig.icon;

  const priorityColor = signal.scores.priority >= 80 ? "text-emerald-400" :
                        signal.scores.priority >= 65 ? "text-indigo-300" :
                        signal.scores.priority >= 50 ? "text-amber-400" : "text-red-400";

  const timeAgo = formatTimeAgo(new Date(signal.detectedAt));

  if (compact) {
    return (
      <Link href={`/think-tank/signals/${signal.id}`}>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all group">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${typeConfig.color}15` }}
          >
            <TypeIcon size={16} style={{ color: typeConfig.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{signal.title}</p>
            <p className="text-xs text-white/40">{signal.vertical.name} • {timeAgo}</p>
          </div>
          <div className={`text-sm font-bold ${priorityColor}`}>
            {signal.scores.priority}
          </div>
          <ChevronRight size={16} className="text-white/20 group-hover:text-white/40 transition-colors" />
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/think-tank/signals/${signal.id}`}>
      <Card hoverable className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${typeConfig.color}15` }}
            >
              <TypeIcon size={16} style={{ color: typeConfig.color }} />
            </div>
            <div>
              <span className="text-xs font-medium" style={{ color: typeConfig.color }}>
                {typeConfig.label}
              </span>
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span>{signal.vertical.icon} {signal.vertical.name}</span>
                <span>•</span>
                <Clock size={10} />
                <span>{timeAgo}</span>
              </div>
            </div>
          </div>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-white mb-2 line-clamp-2">{signal.title}</h3>

        {/* Summary */}
        <p className="text-sm text-white/50 mb-4 line-clamp-2">{signal.summary}</p>

        {/* Scores */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <ScoreBar label="Novelty" value={signal.scores.novelty} />
          <ScoreBar label="Impact" value={signal.scores.impact} />
          <ScoreBar label="Confidence" value={signal.scores.confidence} />
          <ScoreBar label="Urgency" value={signal.scores.urgency} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <span className="text-xs text-white/40">{signal.sourceCount} sources</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50">Priority</span>
            <span className={`text-lg font-bold ${priorityColor}`}>
              {signal.scores.priority}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "bg-emerald-500" :
                value >= 60 ? "bg-indigo-500" :
                value >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/40">{label}</span>
        <span className="text-[10px] font-medium text-white/60">{value}</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
