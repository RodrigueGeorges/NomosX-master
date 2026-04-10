import React from 'react';
import { cn } from '@/lib/utils';

const RadioGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
RadioGroup.displayName = "RadioGroup"

export { RadioGroup };