import React from 'react';

import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "pulse" | "shimmer";
}

export function Skeleton({ className, variant = "shimmer", ...props }: SkeletonProps) {
  const variants = {
    pulse: "animate-pulse bg-white/5",
    shimmer: "animate-shimmer overflow-hidden"
  };
  
  return (
    <div 
      className={cn(
        "rounded-2xl", 
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
