"use client";

import React from 'react';
import { Researcher } from '@/lib/researchers';

interface ResearcherAvatarProps {
  researcher: Researcher;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'circle' | 'rounded' | 'square';
  showStatus?: boolean;
  status?: 'idle' | 'analyzing' | 'debating' | 'synthesizing';
  showInitials?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-sm',
  xl: 'w-12 h-12 text-base'
};

const shapeClasses = {
  circle: 'rounded-full',
  rounded: 'rounded-lg',
  square: 'rounded-none'
};

const statusColors = {
  idle: 'bg-gray-400',
  analyzing: 'bg-green-400',
  debating: 'bg-yellow-400',
  synthesizing: 'bg-blue-400'
};

export default function ResearcherAvatar({
  researcher,
  size = 'md',
  variant = 'circle',
  showStatus = false,
  status = 'idle',
  showInitials = true,
  className = ''
}: ResearcherAvatarProps) {
  const baseClasses = `
    ${sizeClasses[size]}
    ${shapeClasses[variant]}
    flex items-center justify-center
    font-semibold
    transition-all duration-300
    relative
    ${className}
  `;

  const gradientStyle = {
    background: `linear-gradient(135deg, ${researcher.colorHex}20, ${researcher.colorHex}08)`,
    border: `1px solid ${researcher.colorHex}30`,
    color: researcher.colorHex,
    boxShadow: `0 0 20px ${researcher.colorHex}15`
  };

  return (
    <div className={baseClasses} style={gradientStyle}>
      {/* Avatar Content */}
      {showInitials && (
        <span className="relative z-10">{researcher.initials}</span>
      )}

      {/* Status Indicator */}
      {showStatus && (
        <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#09090b]">
          <div className={`w-full h-full rounded-full ${statusColors[status]} animate-pulse`} />
        </div>
      )}

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 rounded-inherit opacity-0 hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `linear-gradient(135deg, ${researcher.colorHex}30, ${researcher.colorHex}15)`,
          filter: 'blur(8px)'
        }}
      />
    </div>
  );
}
