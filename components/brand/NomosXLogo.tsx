"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  variant?: "full" | "symbol" | "wordmark";
  className?: string;
  styleSize?: number;
}

const symbolSizes = { sm: 28, md: 36, lg: 44, xl: 60, "2xl": 80, "3xl": 120, "4xl": 160, "5xl": 220 };
const textSizes  = { sm: "text-[15px]", md: "text-[18px]", lg: "text-[22px]", xl: "text-[30px]", "2xl": "text-[42px]", "3xl": "text-[56px]", "4xl": "text-[72px]", "5xl": "text-[96px]" };
const gapSizes   = { sm: "gap-2", md: "gap-2.5", lg: "gap-3", xl: "gap-4", "2xl": "gap-5", "3xl": "gap-6", "4xl": "gap-8", "5xl": "gap-10" };

/**
 * NomosX — Greek Nu (Ν) mark
 * Three precision strokes: left vertical · diagonal · right vertical
 * Pure white on black, no gradient, no fill — carved inscription aesthetic.
 */
function NomosSymbol({ px, className }: { px: number; className?: string }) {
  const sw = Math.max(1.8, px * 0.038); // stroke width scales with size

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Left vertical stroke */}
      <line x1="22" y1="16" x2="22" y2="84" stroke="white" strokeWidth={sw} strokeLinecap="square" />
      {/* Diagonal — top-left to bottom-right */}
      <line x1="22" y1="16" x2="78" y2="84" stroke="white" strokeWidth={sw} strokeLinecap="square" />
      {/* Right vertical stroke */}
      <line x1="78" y1="16" x2="78" y2="84" stroke="white" strokeWidth={sw} strokeLinecap="square" />
    </svg>
  );
}

export function NomosXLogo({ size = "md", variant = "full", className, styleSize }: LogoProps) {
  const px = styleSize ?? symbolSizes[size];

  if (variant === "symbol") {
    return (
      <div className={cn("inline-flex items-center justify-center", className)}>
        <NomosSymbol px={px} />
      </div>
    );
  }

  if (variant === "wordmark") {
    return (
      <div className={cn("inline-flex items-center", className)}>
        <span className={cn("font-display font-semibold tracking-tight text-white", textSizes[size])}>
          Nomos<span className="text-white/60">X</span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center", gapSizes[size], className)}>
      <NomosSymbol px={px} />
      <span className={cn("font-display font-semibold tracking-tight text-white", textSizes[size])}>
        Nomos<span className="text-white/50">X</span>
      </span>
    </div>
  );
}
