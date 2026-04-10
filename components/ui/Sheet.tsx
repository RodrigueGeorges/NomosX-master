import React from 'react';
import { cn } from '@/lib/utils';

const Sheet = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
Sheet.displayName = "Sheet"

export { Sheet };