import React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react';

interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
  children?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const alertVariants = {
  info: {
    container: 'border-blue-500/20 bg-blue-500/5',
    icon: 'text-blue-400',
    title: 'text-blue-300',
    description: 'text-blue-200/80'
  },
  success: {
    container: 'border-green-500/20 bg-green-500/5',
    icon: 'text-green-400',
    title: 'text-green-300',
    description: 'text-green-200/80'
  },
  warning: {
    container: 'border-yellow-500/20 bg-yellow-500/5',
    icon: 'text-yellow-400',
    title: 'text-yellow-300',
    description: 'text-yellow-200/80'
  },
  error: {
    container: 'border-red-500/20 bg-red-500/5',
    icon: 'text-red-400',
    title: 'text-red-300',
    description: 'text-red-200/80'
  }
};

const alertIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle
};

export function Alert({ 
  variant = 'info', 
  title, 
  description, 
  children, 
  dismissible = false, 
  onDismiss,
  className 
}: AlertProps) {
  const variantStyles = alertVariants[variant];
  const Icon = alertIcons[variant];

  return (
    <div className={cn(
      "relative p-4 rounded-lg border",
      variantStyles.container,
      className
    )}>
      <div className="flex items-start">
        <Icon className={cn("w-5 h-5 mt-0.5", variantStyles.icon)} />
        
        <div className="ml-3 flex-1">
          {title && (
            <h3 className={cn("text-sm font-medium mb-1", variantStyles.title)}>
              {title}
            </h3>
          )}
          
          {description && (
            <p className={cn("text-sm", variantStyles.description)}>
              {description}
            </p>
          )}
          
          {children && (
            <div className={cn("text-sm", variantStyles.description)}>
              {children}
            </div>
          )}
        </div>
        
        {dismissible && (
          <button
            onClick={onDismiss}
            className={cn(
              "ml-3 inline-flex text-white/40 hover:text-white/60 transition-colors",
              variantStyles.icon
            )}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

interface AlertInlineProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
  className?: string;
}

export function AlertInline({ variant = 'info', children, className }: AlertInlineProps) {
  const variantStyles = alertVariants[variant];
  const Icon = alertIcons[variant];

  return (
    <div className={cn(
      "flex items-center gap-2 p-3 rounded-lg border",
      variantStyles.container,
      className
    )}>
      <Icon className={cn("w-4 h-4", variantStyles.icon)} />
      <span className={cn("text-sm", variantStyles.description)}>
        {children}
      </span>
    </div>
  );
}

// Pre-configured alert components
export function InfoAlert(props: Omit<AlertProps, 'variant'>) {
  return <Alert variant="info" {...props} />;
}

export function SuccessAlert(props: Omit<AlertProps, 'variant'>) {
  return <Alert variant="success" {...props} />;
}

export function WarningAlert(props: Omit<AlertProps, 'variant'>) {
  return <Alert variant="warning" {...props} />;
}

export function ErrorAlert(props: Omit<AlertProps, 'variant'>) {
  return <Alert variant="error" {...props} />;
}
