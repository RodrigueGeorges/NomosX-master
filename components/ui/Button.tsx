import React from 'react';

import { cn } from '@/lib/utils';
import { LoadingSpinner } from './LoadingSpinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "destructive" | "secondary" | "ghost" | "ai" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({ 
  className, 
  variant = "primary", 
  size = "md", 
  loading = false,
  children,
  disabled,
  ...props 
}: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group";
  
  const sizes = { 
    sm: "h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm", 
    md: "h-10 px-3 text-sm sm:h-11 sm:px-4", 
    lg: "h-11 px-4 text-sm sm:h-12 sm:px-5 sm:text-base" 
  }[size];
  
  const variants = {
    primary: "bg-accent text-white hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] shadow-card",
    secondary: "bg-transparent text-text border border-border hover:bg-panel2 hover:border-accent/40",
    ai: "bg-ai text-black hover:brightness-105 hover:scale-[1.02] active:scale-[0.98] shadow-glow hover:shadow-[0_0_30px_rgba(94,234,212,0.25)]",
    ghost: "bg-transparent text-text border border-border hover:bg-panel hover:border-border-hover",
    danger: "bg-danger text-white hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]",
    success: "bg-success text-white hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]",
    outline: "bg-transparent text-text border border-border hover:bg-panel hover:border-accent/40",
    destructive: "bg-danger text-white hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]"
  }[variant];
  
  return (
    <button 
      className={cn(base, sizes, variants, className)} 
      disabled={disabled || loading}
      {...props}
    >
      {/* Shimmer effect on hover */}
      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      {loading && <LoadingSpinner size={16} />}
      <span className={cn("transition-opacity", loading && "opacity-0")}>{children}</span>
    </button>
  );
}
