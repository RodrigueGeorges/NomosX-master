"use client";

import React, { useState } from 'react';
import { Researcher } from '@/lib/researchers';
import { User, Brain, BookOpen, TrendingUp, Shield, Scale, Leaf, Calculator } from 'lucide-react';

interface AdvancedResearcherAvatarProps {
  researcher: Researcher;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showPhoto?: boolean;
  showStatus?: boolean;
  status?: 'idle' | 'analyzing' | 'debating' | 'synthesizing';
  interactive?: boolean;
  className?: string;
}

const domainIcons = {
  economics: TrendingUp,
  technology: Brain,
  policy: Shield,
  health: BookOpen,
  security: Scale,
  law: Scale,
  environment: Leaf,
  quantitative: Calculator
};

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
};

export default function AdvancedResearcherAvatar({
  researcher,
  size = 'md',
  showPhoto = false,
  showStatus = false,
  status = 'idle',
  interactive = false,
  className = ''
}: AdvancedResearcherAvatarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const IconComponent = domainIcons[researcher.id as keyof typeof domainIcons] || User;

  const baseClasses = `
    ${sizeClasses[size]}
    rounded-xl
    relative
    overflow-hidden
    transition-all duration-500
    ${interactive ? 'cursor-pointer' : ''}
    ${className}
  `;

  const gradientStyle = {
    background: `linear-gradient(135deg, ${researcher.colorHex}25, ${researcher.colorHex}10)`,
    border: `1px solid ${researcher.colorHex}30`,
    boxShadow: isHovered ? `0 0 30px ${researcher.colorHex}25` : `0 0 20px ${researcher.colorHex}15`
  };

  const statusColors = {
    idle: 'bg-white/30',
    analyzing: 'bg-green-400',
    debating: 'bg-yellow-400',
    synthesizing: 'bg-indigo-400'
  };

  return (
    <div
      className={baseClasses}
      style={gradientStyle}
      onMouseEnter={() => interactive && setIsHovered(true)}
      onMouseLeave={() => interactive && setIsHovered(false)}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="w-full h-full" style={{
          backgroundImage: `radial-gradient(circle at 30% 30%, ${researcher.colorHex}40 1px, transparent 1px)`,
          backgroundSize: '8px 8px'
        }} />
      </div>

      {/* Avatar Content */}
      <div className="relative z-10 w-full h-full flex items-center justify-center">
        {showPhoto ? (
          <div className="w-full h-full relative">
            {/* Photo Placeholder */}
            <div className="w-full h-full bg-gradient-to-br from-indigo-500/20 to-violet-500/10 flex items-center justify-center">
              <IconComponent size={size === 'xl' ? 24 : size === 'lg' ? 20 : 16} style={{ color: researcher.colorHex }} />
            </div>
            
            {/* Initials Overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-bold text-white/90" style={{
                fontSize: size === 'xl' ? '1.5rem' : size === 'lg' ? '1.25rem' : '1rem',
                textShadow: `0 0 10px ${researcher.colorHex}`
              }}>
                {researcher.initials}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <IconComponent size={size === 'xl' ? 24 : size === 'lg' ? 20 : 16} style={{ color: researcher.colorHex }} />
            <div className="mt-1">
              <span className="font-bold text-xs" style={{ color: researcher.colorHex }}>
                {researcher.initials}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Status Indicator */}
      {showStatus && (
        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#09090b] z-20">
          <div className={`w-full h-full rounded-full ${statusColors[status]} animate-pulse`} />
        </div>
      )}

      {/* Hover Effect */}
      {interactive && (
        <div className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none z-30"
          style={{
            background: `linear-gradient(135deg, ${researcher.colorHex}40, ${researcher.colorHex}20)`,
            filter: 'blur(12px)'
          }}
        />
      )}

      {/* Domain Badge */}
      {isHovered && interactive && (
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-[#0C0C12] border border-white/[0.1] rounded-full text-xs text-white/90 whitespace-nowrap z-40">
          {researcher.domain}
        </div>
      )}
    </div>
  );
}
