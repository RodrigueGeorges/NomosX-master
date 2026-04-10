import React from 'react';
import { cn } from '@/lib/utils';

const NavigationMenu = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
NavigationMenu.displayName = "NavigationMenu"

export { NavigationMenu };