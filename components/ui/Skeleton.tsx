import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "rect" | "circle" | "text";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = "rect",
  width,
  height,
}: SkeletonProps) {
  const style: React.CSSProperties = {
    ...(width ? { width: typeof width === "number" ? `${width}px` : width } : {}),
    ...(height ? { height: typeof height === "number" ? `${height}px` : height } : {}),
  };

  return (
    <span
      aria-hidden="true"
      role="presentation"
      className={cn(
        "nx-skeleton inline-block",
        variant === "circle" && "rounded-full",
        variant === "text" && "h-[1em] rounded-[0.25em]",
        variant === "rect" && "rounded-[2px]",
        className
      )}
      style={style}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastLineWidth?: string;
  className?: string;
}

export function SkeletonText({
  lines = 3,
  lineHeight = 14,
  gap = 8,
  lastLineWidth = "60%",
  className,
}: SkeletonTextProps) {
  return (
    <div
      className={cn("flex flex-col", className)}
      style={{ gap: `${gap}px` }}
      aria-hidden="true"
      role="presentation"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          height={lineHeight}
          width={i === lines - 1 ? lastLineWidth : "100%"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="nx-surface p-5 sm:p-6 flex flex-col min-h-[220px]" aria-hidden="true">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton width={60} height={11} />
        <Skeleton width={40} height={11} className="ml-auto" />
      </div>
      <Skeleton variant="text" height={20} width="90%" className="mb-2" />
      <Skeleton variant="text" height={20} width="70%" className="mb-4" />
      <SkeletonText lines={2} lineHeight={12} gap={6} className="mb-4 flex-1" />
      <div className="flex items-end justify-between pt-3 border-t border-black/[0.08] dark:border-white/[0.08]">
        <div className="flex flex-col gap-1">
          <Skeleton width={50} height={24} />
          <Skeleton width={80} height={11} />
        </div>
        <Skeleton width={40} height={40} />
      </div>
    </div>
  );
}

export function SkeletonVerdictCard() {
  return (
    <div className="nx-surface nx-border-flow relative p-5 sm:p-6" aria-hidden="true">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton variant="circle" width={6} height={6} />
        <Skeleton width={120} height={11} />
      </div>
      <Skeleton variant="text" height={24} width="95%" className="mb-3" />
      <Skeleton variant="text" height={24} width="80%" className="mb-5" />
      <div className="grid grid-cols-2 gap-px bg-black/[0.08] dark:bg-white/[0.08] mb-4">
        <div className="bg-white dark:bg-[#111114] p-4">
          <Skeleton width={80} height={11} className="mb-3" />
          <div className="flex items-end justify-between mb-3">
            <Skeleton width={50} height={28} />
            <Skeleton width={80} height={28} />
          </div>
          <Skeleton width="100%" height={4} />
        </div>
        <div className="bg-white dark:bg-[#111114] p-4">
          <Skeleton width={80} height={11} className="mb-3" />
          <Skeleton width={100} height={20} />
        </div>
      </div>
      <div className="flex gap-4 mb-4">
        <Skeleton width={60} height={12} />
        <Skeleton width={60} height={12} />
      </div>
      <div className="flex justify-between pt-4 border-t border-black/[0.08] dark:border-white/[0.08]">
        <Skeleton width={80} height={11} />
        <Skeleton width={60} height={11} />
      </div>
    </div>
  );
}
