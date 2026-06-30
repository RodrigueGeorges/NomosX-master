import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  align = "left",
  className,
}: PageHeaderProps) {
  const centered = align === "center";

  return (
    <header
      className={cn(
        "mb-12 sm:mb-14",
        centered && "text-center",
        className
      )}
    >
      <div
        className={cn(
          "flex gap-6",
          centered ? "flex-col items-center" : "flex-col sm:flex-row sm:items-end sm:justify-between"
        )}
      >
        <div className={cn(centered && "max-w-2xl")}>
          {eyebrow && (
            <p
              className={cn(
                "font-mono text-[10px] uppercase tracking-[0.24em] text-white/35 mb-4",
                centered && "flex items-center justify-center"
              )}
            >
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl sm:text-4xl lg:text-[3rem] font-semibold tracking-tight text-white leading-[1.08]">
            {title}
          </h1>
          {description && (
            <p className="mt-4 text-base text-white/50 leading-relaxed max-w-2xl">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

export function PageSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("max-w-6xl mx-auto px-6 sm:px-8 py-16 sm:py-20", className)}>
      {children}
    </section>
  );
}

export function EtherealCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8 transition-colors hover:border-white/15",
        className
      )}
    >
      {children}
    </div>
  );
}
