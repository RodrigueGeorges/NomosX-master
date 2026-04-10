/**
 * Trust Score Badge Component
 * 
 * Affiche le trust score avec une visualisation claire et attrayante
 */

import React from 'react';

interface TrustScoreBadgeProps {
  score: number; // 0-1
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export default function TrustScoreBadge({ score, size = "md", showLabel = true }: TrustScoreBadgeProps) {
  const percentage = Math.round(score * 100);

  // Déterminer la couleur et le niveau
  const getLevel = () => {
    if (score < 0.4) return { level: "Faible", color: "from-red-500 to-orange-500", textColor: "text-red-400" };
    if (score < 0.7) return { level: "Moyen", color: "from-amber-500 to-yellow-500", textColor: "text-amber-400" };
    return { level: "Élevé", color: "from-emerald-500 to-green-500", textColor: "text-emerald-400" };
  };

  const { level, color, textColor } = getLevel();

  const sizeClasses = {
    sm: "w-16 h-16 text-lg",
    md: "w-20 h-20 text-xl",
    lg: "w-24 h-24 text-2xl",
  };

  const labelSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Circular badge */}
      <div className={`relative ${sizeClasses[size]} rounded-full bg-gradient-to-br ${color} p-0.5 shadow-lg`}>
        <div className="w-full h-full rounded-full bg-[#0A0A0B] flex items-center justify-center">
          <span className={`font-bold ${textColor}`}>{percentage}%</span>
        </div>
      </div>

      {/* Label */}
      {showLabel && (
        <div className="flex flex-col items-center">
          <span className={`${labelSizeClasses[size]} font-medium text-white/80`}>Trust Score</span>
          <span className={`${labelSizeClasses[size]} ${textColor}`}>{level}</span>
        </div>
      )}
    </div>
  );
}
