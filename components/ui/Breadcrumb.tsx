import React from 'react';
import { cn } from '@/lib/utils';

const Breadcrumb = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
Breadcrumb.displayName = "Breadcrumb"

export { Breadcrumb };