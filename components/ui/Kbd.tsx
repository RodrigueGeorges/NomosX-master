import React from 'react';
import { cn } from '@/lib/utils';

const Kbd = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
Kbd.displayName = "Kbd"

export { Kbd };