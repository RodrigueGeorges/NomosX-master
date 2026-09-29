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
  const base = "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/25 dark:focus:ring-white/25 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group";
  
  const sizes = { 
    sm: "h-8 px-2.5 text-[10px] sm:h-9 sm:px-3 uppercase tracking-[0.12em]", 
    md: "h-10 px-3 text-[11px] sm:h-11 sm:px-4 uppercase tracking-[0.12em]", 
    lg: "h-11 px-4 text-[11px] sm:h-12 sm:px-5 sm:text-xs uppercase tracking-[0.14em]" 
  }[size];
  
  const variants = {
    primary: "bg-black dark:bg-white text-white dark:text-black hover:bg-black/85 dark:hover:bg-white/85",
    secondary: "bg-transparent text-black/80 dark:text-white/80 border border-black/30 dark:border-white/30 hover:border-black/60 dark:hover:border-white/60 hover:text-black dark:hover:text-white",
    ai: "bg-black dark:bg-white text-white dark:text-black hover:bg-black/85 dark:hover:bg-white/85",
    ghost: "bg-transparent text-black/60 dark:text-white/60 border border-black/15 dark:border-white/15 hover:border-black/35 dark:hover:border-white/35 hover:text-black dark:hover:text-white",
    danger: "bg-red-600 text-black dark:text-white hover:bg-red-500",
    success: "bg-black dark:bg-white text-white dark:text-black hover:bg-black/85 dark:hover:bg-white/85",
    outline: "bg-transparent text-black/80 dark:text-white/80 border border-black/30 dark:border-white/30 hover:border-black/60 dark:hover:border-white/60 hover:text-black dark:hover:text-white",
    destructive: "bg-red-600 text-black dark:text-white hover:bg-red-500"
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
