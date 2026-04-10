"use client";
import React from 'react';
import { type Researcher } from '@/lib/researchers';

/**
 * ResearcherBadge — Author attribution on publications
 * 
 * Shows the AI researcher who authored a publication.
 * Available in 3 sizes: sm (inline), md (card), lg (publication header).
 */

interface ResearcherBadgeProps {
  researcher: Researcher;
  size?: "sm" | "md" | "lg";
  showInstitution?: boolean;
  className?: string;
}

export default function ResearcherBadge({ 
  researcher, 
  size = "md", 
  showInstitution = false,
  className = "" 
}: ResearcherBadgeProps) {
  if (size === "sm") {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <div 
          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold"
          style={{ 
            background: `linear-gradient(135deg, ${researcher.colorHex}30, ${researcher.colorHex}10)`,
            border: `1px solid ${researcher.colorHex}30`,
            color: researcher.colorHex 
          }}
        >
          {researcher.initials}
        </div>
        <span className="text-xs text-white/50">{researcher.name}</span>
      </div>
    );
  }

  if (size === "lg") {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        <div 
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-semibold nx-glow"
          style={{ 
            background: `linear-gradient(135deg, ${researcher.colorHex}25, ${researcher.colorHex}08)`,
            border: `1px solid ${researcher.colorHex}25`,
            color: researcher.colorHex,
            boxShadow: `0 0 30px ${researcher.colorHex}15`
          }}
        >
          {researcher.initials}
        </div>
        <div>
          <div className="text-base font-medium text-white/90">{researcher.name}</div>
          <div className="text-sm text-white/40">{researcher.specialty}</div>
          {showInstitution && (
            <div className="text-xs text-white/25 mt-0.5">{researcher.institution}</div>
          )}
        </div>
      </div>
    );
  }

  // Default: md
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div 
        className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-semibold"
        style={{ 
          background: `linear-gradient(135deg, ${researcher.colorHex}20, ${researcher.colorHex}08)`,
          border: `1px solid ${researcher.colorHex}20`,
          color: researcher.colorHex 
        }}
      >
        {researcher.initials}
      </div>
      <div>
        <div className="text-sm font-medium text-white/80">{researcher.name}</div>
        {showInstitution && (
          <div className="text-xs text-white/30">{researcher.institution}</div>
        )}
      </div>
    </div>
  );
}
