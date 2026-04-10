import React from 'react';
import { cn } from '@/lib/utils';

const ContextMenu = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
ContextMenu.displayName = "ContextMenu"

export { ContextMenu };