
"use client";
import React from 'react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

type Props = {
  content: string | React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
};

export function Tooltip({ 
  content, 
  children, 
  position = "top",
  delay = 200
}: Props) {
  const [show, setShow] = useState(false);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    const t = setTimeout(() => setShow(true), delay);
    setTimer(t);
  };

  const handleMouseLeave = () => {
    if (timer) clearTimeout(timer);
    setShow(false);
  };

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2"
  };

  return (
    <div 
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && (
        <div 
          className={cn(
            "absolute z-50 px-3 py-1.5 text-xs font-medium text-text bg-panel2 border border-border rounded-lg shadow-lg animate-scale-in whitespace-nowrap",
            positions[position]
          )}
        >
          {content}
          {/* Arrow */}
          <div 
            className={cn(
              "absolute w-2 h-2 bg-panel2 border-border rotate-45",
              position === "top" && "bottom-[-4px] left-1/2 -translate-x-1/2 border-b border-r",
              position === "bottom" && "top-[-4px] left-1/2 -translate-x-1/2 border-t border-l",
              position === "left" && "right-[-4px] top-1/2 -translate-y-1/2 border-r border-t",
              position === "right" && "left-[-4px] top-1/2 -translate-y-1/2 border-l border-b"
            )}
          />
        </div>
      )}
    </div>
  );
}
