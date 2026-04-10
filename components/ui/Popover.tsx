import React from 'react';
import { cn } from '@/lib/utils';

const Popover = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
Popover.displayName = "Popover"

export { Popover };