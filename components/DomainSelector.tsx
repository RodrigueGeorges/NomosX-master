"use client";
import React from 'react';

import { PREDEFINED_DOMAINS,type Domain } from '@/lib/domains';

type Props = {
  selected: string[];
  onChange: (selected: string[]) => void;
  mode?: "single" | "multiple";
  compact?: boolean;
};

export default function DomainSelector({
  selected,
  onChange,
  mode = "multiple",
  compact = false,
}: Props) {
  function toggle(slug: string) {
    if (mode === "single") {
      onChange(selected.includes(slug) ? [] : [slug]);
    } else {
      if (selected.includes(slug)) {
        onChange(selected.filter((s) => s !== slug));
      } else {
        onChange([...selected, slug]);
      }
    }
  }

  if (compact) {
    // Version compacte pour filtres
    return (
      <div className="flex gap-2 flex-wrap">
        {PREDEFINED_DOMAINS.map((domain) => {
          const isSelected = selected.includes(domain.slug);
          const Icon = domain.icon;

          return (
            <button
              key={domain.slug}
              onClick={() => toggle(domain.slug)}
              className={`px-4 py-2 rounded-2xl border transition-all inline-flex items-center gap-2 ${
                isSelected
                  ? "border-accent/40 text-accent bg-accent/10"
                  : "border-border text-muted bg-panel hover:bg-panel2"
              }`}
            >
              <Icon size={14} />
              {domain.name}
            </button>
          );
        })}
      </div>
    );
  }

  // Version étendue avec descriptions
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {PREDEFINED_DOMAINS.map((domain) => {
        const isSelected = selected.includes(domain.slug);
        const Icon = domain.icon;

        return (
          <button
            key={domain.slug}
            onClick={() => toggle(domain.slug)}
            className={`
              p-4 rounded-2xl border-2 transition-all text-left
              hover:scale-[1.02] active:scale-[0.98]
              ${
                isSelected
                  ? "border-accent bg-accent/10 shadow-lg"
                  : "border-border bg-panel hover:border-accent/40"
              }
            `}
          >
            <div className="flex items-start gap-3">
              <div
                className="p-2 rounded-xl"
                style={{
                  backgroundColor: isSelected
                    ? `${domain.color}20`
                    : "rgba(255,255,255,0.05)",
                  color: domain.color,
                }}
              >
                <Icon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`font-semibold text-sm mb-1 ${
                    isSelected ? "text-accent" : "text-text"
                  }`}
                >
                  {domain.name}
                </div>
                <div className="text-xs text-muted line-clamp-2">
                  {domain.description}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
