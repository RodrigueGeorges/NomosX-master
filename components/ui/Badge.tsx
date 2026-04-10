import React from 'react';

import { cn } from '@/lib/utils';

type BadgeVariant = "default" | "outline" | "secondary" | "success" | "warning" | "error" | "premium" | "ai" | "outline" | "secondary";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: "border-border bg-panel2 text-muted",
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    error: "border-danger/30 bg-danger/10 text-danger",
    premium: "border-accent2/30 bg-accent2/10 text-accent2",
    ai: "border-ai/30 bg-ai/10 text-ai shadow-[0_0_10px_rgba(94,234,212,0.15)]",
    outline: "border-border bg-transparent text-muted",
    secondary: "border-muted bg-muted/10 text-muted"
  };
  
  return (
    <span 
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200",
        variants[variant],
        className
      )} 
      {...props} 
    />
  );
}
