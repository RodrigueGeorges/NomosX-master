import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
}

export function Loading({ size = 'md', className, text }: LoadingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6', 
    lg: 'w-8 h-8'
  };

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="flex items-center gap-3">
        <div 
          className={cn(
            "animate-spin rounded-full border-2 border-accent/30 border-t-accent",
            sizeClasses[size]
          )}
        />
        {text && (
          <span className="text-white/40 text-sm">{text}</span>
        )}
      </div>
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="min-h-screen bg-bg text-text flex items-center justify-center">
      <Loading size="lg" text="Loading..." />
    </div>
  );
}

export function LoadingCard() {
  return (
    <div className="p-6 rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <Loading size="md" text="Loading content..." />
    </div>
  );
}
