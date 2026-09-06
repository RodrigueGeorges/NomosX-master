"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1.5 text-xs font-mono text-black/45", className)}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {item.href ? (
            <Link href={item.href} className="hover:text-black/70 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-black/65">{item.label}</span>
          )}
          {i < items.length - 1 && <ChevronRight size={12} className="text-black/25" />}
        </span>
      ))}
    </nav>
  );
}
