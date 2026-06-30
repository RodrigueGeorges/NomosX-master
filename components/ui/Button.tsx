import React from 'react';

import { cn } from '@/lib/utils';

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
  const base = "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/25 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group";
  
  const sizes = { 
    sm: "h-8 px-2.5 text-[10px] sm:h-9 sm:px-3 uppercase tracking-[0.12em]", 
    md: "h-10 px-3 text-[11px] sm:h-11 sm:px-4 uppercase tracking-[0.12em]", 
    lg: "h-11 px-4 text-[11px] sm:h-12 sm:px-5 sm:text-xs uppercase tracking-[0.14em]" 
  }[size];
  
  const variants = {
    primary: "bg-white text-black hover:bg-white/90",
    secondary: "bg-transparent text-white/80 border border-white/30 hover:border-white/60 hover:text-white",
    ai: "bg-white text-black hover:bg-white/90",
    ghost: "bg-transparent text-white/60 border border-white/15 hover:border-white/35 hover:text-white",
    danger: "bg-red-600 text-white hover:bg-red-500",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
    outline: "bg-transparent text-white/80 border border-white/30 hover:border-white/60 hover:text-white",
    destructive: "bg-red-600 text-white hover:bg-red-500"
  }[variant];
  
  return (
    <button 
      className={cn(base, sizes, variants, className)} 
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      ) : null}
      <span className={cn(loading && "opacity-0 absolute")}>{children}</span>
    </button>
  );
}
