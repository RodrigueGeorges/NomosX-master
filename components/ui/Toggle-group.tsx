import React from 'react';
import { cn } from '@/lib/utils';

const ToggleGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
ToggleGroup.displayName = "ToggleGroup"

export { ToggleGroup };