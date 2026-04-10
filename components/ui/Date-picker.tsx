import React from 'react';
import { cn } from '@/lib/utils';

const DatePicker = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
DatePicker.displayName = "DatePicker"

export { DatePicker };