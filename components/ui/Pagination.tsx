import React from 'react';
import { cn } from '@/lib/utils';

const Pagination = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
Pagination.displayName = "Pagination"

export { Pagination };