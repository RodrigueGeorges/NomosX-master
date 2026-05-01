"use client";

import { useId } from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'full' | 'symbol' | 'wordmark';
  className?: string;
}

const symbolSizes = { sm: 28, md: 36, lg: 44, xl: 60, '2xl': 80 };
const textSizes = { sm: 'text-[15px]', md: 'text-[18px]', lg: 'text-[22px]', xl: 'text-[30px]', '2xl': 'text-[42px]' };
const gapSizes = { sm: 'gap-2', md: 'gap-2.5', lg: 'gap-3', xl: 'gap-4', '2xl': 'gap-5' };

function NomosSymbol({ px, className }: { px: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const gradId = `${id}-grad`;
  const coreId = `${id}-core`;
  const logoGlowId = `${id}-logo-glow`;
  const goldGlowId = `${id}-gold-glow`;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#A5B4FC" />
          <stop offset="45%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <radialGradient id={coreId} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="38%" stopColor="#F5D778" />
          <stop offset="100%" stopColor="#D4AF37" />
        </radialGradient>
        <filter id={logoGlowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={goldGlowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="60" cy="60" r="52" fill="#09090B" stroke="white" strokeOpacity="0.10" strokeWidth="1.2" />
      <path d="M60 9 L68 24 H52 L60 9Z" fill="#F5D778" opacity="0.55" />
      <path d="M60 111 L52 96 H68 L60 111Z" fill="#F5D778" opacity="0.42" />
      <path d="M9 60 L24 52 V68 L9 60Z" fill="#A5B4FC" opacity="0.28" />
      <path d="M111 60 L96 68 V52 L111 60Z" fill="#A5B4FC" opacity="0.28" />
      <circle cx="60" cy="60" r="42" stroke={`url(#${gradId})`} strokeWidth="1.3" strokeOpacity="0.50" />
      <path d="M60 18 A42 42 0 0 1 102 60" stroke="#F5D778" strokeWidth="1" strokeOpacity="0.38" strokeLinecap="round" />
      <path d="M60 102 A42 42 0 0 1 18 60" stroke="#F5D778" strokeWidth="1" strokeOpacity="0.28" strokeLinecap="round" />
      <ellipse cx="60" cy="60" rx="50" ry="18" stroke="#A5B4FC" strokeWidth="1.1" strokeOpacity="0.24" transform="rotate(-24 60 60)" />
      <ellipse cx="60" cy="60" rx="49" ry="17" stroke="#7C3AED" strokeWidth="1.1" strokeOpacity="0.26" transform="rotate(28 60 60)" />

      <path d="M31 35 V86" stroke={`url(#${gradId})`} strokeWidth="8" strokeLinecap="round" filter={`url(#${logoGlowId})`} />
      <path d="M89 35 V86" stroke={`url(#${gradId})`} strokeWidth="8" strokeLinecap="round" filter={`url(#${logoGlowId})`} />
      <path d="M34 36 L86 84" stroke={`url(#${gradId})`} strokeWidth="8" strokeLinecap="round" opacity="0.92" filter={`url(#${logoGlowId})`} />
      <path d="M86 36 L34 84" stroke={`url(#${gradId})`} strokeWidth="8" strokeLinecap="round" opacity="0.72" filter={`url(#${logoGlowId})`} />

      <circle cx="60" cy="60" r="11" fill={`url(#${coreId})`} filter={`url(#${goldGlowId})`} />
      <circle cx="60" cy="60" r="4.2" fill="#09090B" opacity="0.92" />
      <circle cx="60" cy="60" r="1.6" fill="#F5D778" />

      <circle cx="31" cy="35" r="3" fill="#E0E7FF" />
      <circle cx="89" cy="86" r="3" fill="#C4B5FD" />
      <circle cx="89" cy="35" r="2.5" fill="#A5B4FC" opacity="0.85" />
      <circle cx="31" cy="86" r="2.5" fill="#8B5CF6" opacity="0.85" />
    </svg>
  );
}

export function NomosXLogo({ size = 'md', variant = 'full', className }: LogoProps) {
  const px = symbolSizes[size];

  if (variant === 'symbol') {
    return (
      <div className={cn('inline-flex items-center justify-center', className)}>
        <NomosSymbol px={px} />
      </div>
    );
  }

  if (variant === 'wordmark') {
    return (
      <div className={cn('inline-flex items-center', className)}>
        <span className={cn(
          'font-display font-semibold tracking-tight',
          'bg-gradient-to-r from-indigo-200 via-white to-violet-200 bg-clip-text text-transparent',
          textSizes[size]
        )}>
          Nomos<span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-[#F5D778] bg-clip-text text-transparent">X</span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn('inline-flex items-center', gapSizes[size], className)}>
      <NomosSymbol px={px} />
      <span className={cn(
        'font-display font-semibold tracking-tight',
        'bg-gradient-to-r from-white via-indigo-100 to-violet-200 bg-clip-text text-transparent',
        textSizes[size]
      )}>
        Nomos<span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-[#F5D778] bg-clip-text text-transparent">X</span>
      </span>
    </div>
  );
}
