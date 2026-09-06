"use client";

interface SparklineProps {
  series?: number[];
  className?: string;
}

export function ScenarioSparkline({ series, className }: SparklineProps) {
  if (!series?.length || series.length < 2) return null;

  const w = 80;
  const h = 24;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 0.01;

  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className ?? "w-20 h-6 opacity-70"}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={points}
        className="text-black"
      />
    </svg>
  );
}
