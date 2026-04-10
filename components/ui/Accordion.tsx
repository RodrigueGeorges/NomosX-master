import React from 'react';
import { cn } from '@/lib/utils';

const Accordion = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("border-b", className)}
    {...props}
  />
))
Accordion.displayName = "Accordion"

export { Accordion };