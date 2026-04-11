
"use client";

import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'full' | 'symbol' | 'wordmark';
  className?: string;
}

const symbolSizes = { sm: 28, md: 36, lg: 44, xl: 60, '2xl': 80 };
const textSizes   = { sm: 'text-[15px]', md: 'text-[18px]', lg: 'text-[22px]', xl: 'text-[30px]', '2xl': 'text-[42px]' };
const gapSizes    = { sm: 'gap-2', md: 'gap-2.5', lg: 'gap-3', xl: 'gap-4', '2xl': 'gap-5' };

function NomosSymbol({ px, className }: { px: number; className?: string }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="nx-logo-grad" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%"   stopColor="#818CF8" />
          <stop offset="50%"  stopColor="#6366F1" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="nx-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#D4AF37" />
          <stop offset="50%"  stopColor="#F5D778" />
          <stop offset="100%" stopColor="#D4AF37" />
        </linearGradient>
        <filter id="nx-logo-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="nx-gold-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="nx-body-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Left vertical bar */}
      <path d="M 25 28 L 25 92 L 34 92 L 34 28 Z" fill="url(#nx-logo-grad)" filter="url(#nx-body-glow)" />

      {/* Right vertical bar */}
      <path d="M 86 28 L 86 92 L 95 92 L 95 28 Z" fill="url(#nx-logo-grad)" filter="url(#nx-body-glow)" />

      {/* Top-left to centre diagonal */}
      <path d="M 34 33 L 62 60 L 86 84 L 94 77 L 62 51 L 34 26 Z" fill="url(#nx-logo-grad)" filter="url(#nx-body-glow)" />

      {/* Top-right to centre diagonal */}
      <path d="M 86 33 L 58 60 L 34 84 L 26 77 L 58 51 L 86 26 Z" fill="url(#nx-logo-grad)" opacity="0.80" filter="url(#nx-body-glow)" />

      {/* Centre node — the resolved X, glowing gold */}
      <circle cx="60" cy="60" r="9"   fill="#D4AF37"  filter="url(#nx-gold-glow)" opacity="0.85" />
      <circle cx="60" cy="60" r="4"   fill="#F5D778"  opacity="0.9" />

      {/* Greek letters: Ξ (Xi) for X, Ν (Nu) for Nomos */}
      <text x="60" y="64" text-anchor="middle" font-family="serif" font-size="7" font-weight="bold" fill="#09090b" opacity="0.9">Ξ</text>
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
          'font-display font-semibold tracking-[-0.02em]',
          'bg-gradient-to-r from-indigo-300 via-white to-violet-300 bg-clip-text text-transparent',
          textSizes[size]
        )}>
          Nomos<span className="bg-gradient-to-r from-amber-500 to-yellow-400 bg-clip-text text-transparent">X</span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn('inline-flex items-center', gapSizes[size], className)}>
      <NomosSymbol px={px} />
      <span className={cn(
        'font-display font-semibold tracking-[-0.02em]',
        'bg-gradient-to-r from-white via-indigo-100 to-violet-200 bg-clip-text text-transparent',
        textSizes[size]
      )}>
        Nomos<span className="bg-gradient-to-r from-amber-500 to-yellow-400 bg-clip-text text-transparent">X</span>
      </span>
    </div>
  );
}
