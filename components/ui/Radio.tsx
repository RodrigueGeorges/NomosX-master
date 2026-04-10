import React from 'react';
import { cn } from '@/lib/utils';

interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export function Radio({ label, description, className, id, ...props }: RadioProps) {
  const radioId = id || `radio-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className={cn("flex items-start space-x-3", className)}>
      <input
        type="radio"
        id={radioId}
        className={cn(
          "mt-1 h-4 w-4 rounded border border-white/[0.2] bg-white/[0.02] text-indigo-500 focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-0",
          "checked:border-indigo-500 checked:bg-indigo-500"
        )}
        {...props}
      />
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <label 
              htmlFor={radioId}
              className="block text-sm font-medium text-white/80 cursor-pointer"
            >
              {label}
            </label>
          )}
          {description && (
            <p className="text-sm text-white/40 mt-1">{description}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface RadioGroupProps {
  label?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function RadioGroup({ label, error, required, children }: RadioGroupProps) {
  return (
    <div className="space-y-3">
      {label && (
        <div className="block text-sm font-medium text-white/80">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </div>
      )}
      <div className="space-y-3">
        {children}
      </div>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
