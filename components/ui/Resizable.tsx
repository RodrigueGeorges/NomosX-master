import React from 'react';
import { cn } from '@/lib/utils';

const Resizable = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
Resizable.displayName = "Resizable"

export { Resizable };