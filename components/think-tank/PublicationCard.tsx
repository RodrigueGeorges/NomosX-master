"use client";
import React from 'react';

/**
 * PublicationCard Component
 * 
 * Displays a Think Tank publication summary
 * Follows NomosX design system
 */

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FileText,Eye,Clock,CheckCircle,AlertCircle,ChevronRight } from 'lucide-react';

interface PublicationCardProps {
  publication: {
    id: string;
    verticalId: string;
    vertical: {
      id: string;
      slug: string;
      name: string;
      icon?: string;
      color?: string;
    };
    type: string;
    title: string;
    wordCount: number;
    trustScore: number;
    qualityScore: number;
    sourceCount: number;
    publishedAt?: string | null;
    viewCount: number;
    createdAt: string;
  };
  compact?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  RESEARCH_BRIEF: "Research Brief",
  UPDATE_NOTE: "Update Note",
  DATA_NOTE: "Data Note",
  POLICY_NOTE: "Policy Note",
  DOSSIER: "Dossier"
};

export default function PublicationCard({ publication, compact = false }: PublicationCardProps) {
  const isPublished = !!publication.publishedAt;
  const trustColor = publication.trustScore >= 80 ? "text-emerald-400" :
                     publication.trustScore >= 70 ? "text-indigo-300" :
                     publication.trustScore >= 60 ? "text-amber-400" : "text-red-400";

  const timeAgo = publication.publishedAt 
    ? formatTimeAgo(new Date(publication.publishedAt))
    : formatTimeAgo(new Date(publication.createdAt));

  if (compact) {
    return (
      <Link href={`/think-tank/publications/${publication.id}`}>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all group">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${publication.vertical.color}15` }}
          >
            <FileText size={18} style={{ color: publication.vertical.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{publication.title}</p>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <span>{publication.vertical.icon} {publication.vertical.name}</span>
              <span>•</span>
              <span>{TYPE_LABELS[publication.type] || publication.type}</span>
              <span>•</span>
              <span>{timeAgo}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`text-sm font-bold ${trustColor}`}>
              {publication.trustScore}
            </div>
            {isPublished ? (
              <CheckCircle size={16} className="text-emerald-400" />
            ) : (
              <AlertCircle size={16} className="text-amber-400" />
            )}
          </div>
          <ChevronRight size={16} className="text-white/20 group-hover:text-white/40 transition-colors" />
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/think-tank/publications/${publication.id}`}>
      <Card hoverable className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span 
              className="text-lg"
              style={{ color: publication.vertical.color }}
            >
              {publication.vertical.icon}
            </span>
            <div>
              <span className="text-xs font-medium text-white/60">
                {publication.vertical.name}
              </span>
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span>{TYPE_LABELS[publication.type] || publication.type}</span>
                <span>•</span>
                <Clock size={10} />
                <span>{timeAgo}</span>
              </div>
            </div>
          </div>
          <Badge variant={isPublished ? "success" : "warning"}>
            {isPublished ? "Published" : "Draft"}
          </Badge>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-white mb-4 line-clamp-2">{publication.title}</h3>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatBox 
            label="Trust Score" 
            value={publication.trustScore} 
            suffix="/100"
            color={trustColor}
          />
          <StatBox 
            label="Quality" 
            value={publication.qualityScore} 
            suffix="/100"
          />
          <StatBox 
            label="Sources" 
            value={publication.sourceCount} 
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <span className="text-xs text-white/40">{publication.wordCount} words</span>
          {isPublished && (
            <div className="flex items-center gap-1.5 text-white/40">
              <Eye size={12} />
              <span className="text-xs">{publication.viewCount} views</span>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

function StatBox({ 
  label, 
  value, 
  suffix = "",
  color = "text-white"
}: { 
  label: string; 
  value: number; 
  suffix?: string;
  color?: string;
}) {
  return (
    <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <p className="text-[10px] text-white/40 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${color}`}>
        {value}<span className="text-xs font-normal text-white/40">{suffix}</span>
      </p>
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
