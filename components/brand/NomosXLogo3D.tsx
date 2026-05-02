"use client";

import { NomosXLogo } from "@/components/brand/NomosXLogo";

interface Logo3DProps {
  size?: number;
  className?: string;
}

export function NomosXLogo3D({ size = 120, className }: Logo3DProps) {
  return <NomosXLogo size="5xl" variant="symbol" className={className} styleSize={size} />;
}
