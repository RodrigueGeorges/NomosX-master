import React from 'react';

import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  variant?: "default" | "premium" | "ai";
}

export function Card({ className, hoverable = false, variant = "default", ...props }: CardProps) {
  const variants = {
    default: "bg-panel border-border",
    premium: "bg-gradient-to-br from-panel to-panel2 border-accent2/20",
    ai: "bg-panel border-ai/20"
  };
  
  const hoverClass = hoverable 
    ? "transition-all duration-300 hover:shadow-glow hover:-translate-y-1 hover:border-accent/40 cursor-pointer group" 
    : "";
  
  return (
    <div 
      className={cn(
        "rounded-2xl border shadow-card relative overflow-hidden",
        variants[variant],
        hoverClass,
        className
      )} 
      {...props} 
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0 flex items-center gap-2", className)} {...props} />;
}
