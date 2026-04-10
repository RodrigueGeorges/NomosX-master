"use client";
import React from 'react';

/**
 * CadenceIndicator Component
 * 
 * Shows current publication cadence status
 * Follows NomosX design system
 */

import { Clock,AlertCircle,CheckCircle } from 'lucide-react';

interface CadenceIndicatorProps {
  global: {
    daily: { current: number; max: number };
    weekly: { current: number; max: number };
  };
  nextPublishWindow?: Date | string;
  isQuietHours?: boolean;
  compact?: boolean;
}

export default function CadenceIndicator({ 
  global, 
  nextPublishWindow,
  isQuietHours = false,
  compact = false 
}: CadenceIndicatorProps) {
  const dailyPercentage = (global.daily.current / global.daily.max) * 100;
  const weeklyPercentage = (global.weekly.current / global.weekly.max) * 100;
  
  const isDailyNearLimit = dailyPercentage >= 66;
  const isDailyAtLimit = dailyPercentage >= 100;
  const isWeeklyNearLimit = weeklyPercentage >= 75;

  const nextWindow = nextPublishWindow ? new Date(nextPublishWindow) : null;
  const timeToWindow = nextWindow ? formatTimeUntil(nextWindow) : null;

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
        {isDailyAtLimit ? (
          <AlertCircle size={14} className="text-red-400" />
        ) : isDailyNearLimit ? (
          <AlertCircle size={14} className="text-amber-400" />
        ) : (
          <CheckCircle size={14} className="text-emerald-400" />
        )}
        <span className={`text-sm font-medium ${
          isDailyAtLimit ? "text-red-400" : 
          isDailyNearLimit ? "text-amber-400" : 
          "text-white/70"
        }`}>
          {global.daily.current}/{global.daily.max} aujourd'hui
        </span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white/80">Cadence de publication</h3>
        {isQuietHours && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/20">
            <Clock size={12} className="text-purple-400" />
            <span className="text-xs text-purple-400">Heures calmes</span>
          </div>
        )}
      </div>

      {/* Daily Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-white/50">Aujourd'hui</span>
          <span className={`text-xs font-medium ${
            isDailyAtLimit ? "text-red-400" : 
            isDailyNearLimit ? "text-amber-400" : 
            "text-white/70"
          }`}>
            {global.daily.current}/{global.daily.max}
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              isDailyAtLimit ? "bg-red-500" : 
              isDailyNearLimit ? "bg-amber-500" : 
              "bg-gradient-to-r from-indigo-500 to-violet-500"
            }`}
            style={{ width: `${Math.min(dailyPercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Weekly Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-white/50">Cette semaine</span>
          <span className={`text-xs font-medium ${
            isWeeklyNearLimit ? "text-amber-400" : "text-white/70"
          }`}>
            {global.weekly.current}/{global.weekly.max}
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              isWeeklyNearLimit ? "bg-amber-500" : 
              "bg-gradient-to-r from-emerald-500 to-indigo-500"
            }`}
            style={{ width: `${Math.min(weeklyPercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Next Window */}
      {nextWindow && (
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <span className="text-xs text-white/40">Prochaine fenêtre de publication</span>
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-indigo-400" />
            <span className="text-xs font-medium text-indigo-400">{timeToWindow}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  
  if (diffMs <= 0) return "Maintenant";
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;

  if (diffHours > 0) {
    return `${diffHours}h ${remainingMins}min`;
  }
  return `${diffMins}min`;
}
