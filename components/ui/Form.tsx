import React from 'react';
import { cn } from '@/lib/utils';

interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
}

export function Form({ children, className, ...props }: FormProps) {
  return (
    <form className={cn("space-y-4", className)} {...props}>
      {children}
    </form>
  );
}

interface FormFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FormField({ label, error, required, children }: FormFieldProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-white/80">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}

interface FormErrorProps {
  errors?: string[];
}

export function FormErrors({ errors }: FormErrorProps) {
  if (!errors || errors.length === 0) return null;

  return (
    <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
      <div className="text-sm text-red-400">
        {errors.map((error, index) => (
          <div key={index}>• {error}</div>
        ))}
      </div>
    </div>
  );
}

interface FormSuccessProps {
  message: string;
}

export function FormSuccess({ message }: FormSuccessProps) {
  return (
    <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/5">
      <div className="text-sm text-green-400">{message}</div>
    </div>
  );
}
