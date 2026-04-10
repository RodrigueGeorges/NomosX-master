"use client";
import React from 'react';

/**
 * VerticalCard Component
 * 
 * Displays a vertical with cadence progress and pending signals
 * Follows NomosX design system
 */

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { TrendingUp,AlertCircle,FileText } from 'lucide-react';

interface VerticalCardProps {
  vertical: {
    id: string;
    slug: string;
    name: string;
    nameEn?: string;
    description?: string;
    icon?: string;
    color?: string;
    pendingSignals: number;
    publishedCount: number;
    cadence: {
      current: number;
      max: number;
    };
  };
}

export default function VerticalCard({ vertical }: VerticalCardProps) {
  const cadencePercentage = (vertical.cadence.current / vertical.cadence.max) * 100;
  const isNearLimit = cadencePercentage >= 80;
  const isAtLimit = cadencePercentage >= 100;

  return (
    <Link href={`/think-tank/verticals/${vertical.slug}`}>
      <Card hoverable className="p-5 h-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ 
                backgroundColor: `${vertical.color}15`,
                border: `1px solid ${vertical.color}30`
              }}
            >
              {vertical.icon || "📊"}
            </div>
            <div>
              <h3 className="font-semibold text-white">{vertical.name}</h3>
              {vertical.nameEn && (
                <p className="text-xs text-white/40">{vertical.nameEn}</p>
              )}
            </div>
          </div>
          
          {/* Pending signals badge */}
          {vertical.pendingSignals > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
              <AlertCircle size={12} className="text-amber-400" />
              <span className="text-xs font-medium text-amber-400">
                {vertical.pendingSignals}
              </span>
            </div>
          )}
        </div>

        {/* Description */}
        {vertical.description && (
          <p className="text-sm text-white/50 mb-4 line-clamp-2">
            {vertical.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5 text-white/50">
            <FileText size={14} />
            <span className="text-sm">{vertical.publishedCount} publications</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/50">
            <TrendingUp size={14} />
            <span className="text-sm">{vertical.pendingSignals} signaux</span>
          </div>
        </div>

        {/* Cadence Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/50">Cadence hebdo</span>
            <span className={`font-medium ${
              isAtLimit ? "text-red-400" : 
              isNearLimit ? "text-amber-400" : 
              "text-white/70"
            }`}>
              {vertical.cadence.current}/{vertical.cadence.max}
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                isAtLimit ? "bg-red-500" : 
                isNearLimit ? "bg-amber-500" : 
                "bg-gradient-to-r from-indigo-500 to-violet-500"
              }`}
              style={{ width: `${Math.min(cadencePercentage, 100)}%` }}
            />
          </div>
        </div>
      </Card>
    </Link>
  );
}
