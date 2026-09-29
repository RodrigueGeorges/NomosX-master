"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
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
        "mb-10 sm:mb-12",
        centered && "text-center",
        className
      )}
    >
      <ScrollReveal>
        <div
          className={cn(
            "flex gap-4",
            centered ? "flex-col items-center" : "flex-col sm:flex-row sm:items-end sm:justify-between"
          )}
        >
          <div className={cn(centered && "max-w-2xl")}>
            {eyebrow && (
              <p className={cn("nx-eyebrow mb-4", centered && "justify-center")}>
                {eyebrow}
              </p>
            )}
            <h1 className="nx-spx-section-title text-[clamp(2rem,4vw,3rem)]">
              {title}
            </h1>
            {description && (
              <p className="mt-4 nx-read mx-auto text-[var(--nx-text-secondary)] text-base sm:text-lg leading-[1.5]">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </ScrollReveal>
    </header>
  );
}

interface PageSectionProps {
  children: React.ReactNode;
  className?: string;
  sectionIndex?: string;
  divided?: boolean;
}

export function PageSection({
  children,
  className,
  sectionIndex,
  divided = true,
}: PageSectionProps) {
  return (
    <section
      className={cn(
        "relative max-w-6xl mx-auto px-6 sm:px-8 py-12 sm:py-16",
        divided && "nx-section-divide",
        className
      )}
    >
      {sectionIndex && (
        <span className="nx-section-index">{sectionIndex}</span>
      )}
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
        "border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] p-5 sm:p-6 transition-colors hover:border-black/15 dark:hover:border-white/15",
        className
      )}
    >
      {children}
    </div>
  );
}
