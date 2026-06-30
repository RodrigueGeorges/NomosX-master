import React from 'react';

import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  variant?: "default" | "premium" | "ai";
}

export function Card({ className, hoverable = false, variant = "default", ...props }: CardProps) {
  const variants = {
    default: "bg-white/[0.02] border-white/[0.08]",
    premium: "bg-white/[0.02] border-white/[0.08]",
    ai: "bg-white/[0.02] border-white/[0.08]"
  };
  
  const hoverClass = hoverable 
    ? "transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.04] cursor-pointer group" 
    : "";
  
  return (
    <div 
      className={cn(
        "border relative overflow-hidden",
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
  return <h3 className={cn("text-lg font-semibold leading-none tracking-tight text-white", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-white/45", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0 flex items-center gap-2", className)} {...props} />;
}
