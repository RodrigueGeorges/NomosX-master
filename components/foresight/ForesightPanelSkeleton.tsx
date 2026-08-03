"use client";

export function ForesightPanelSkeleton() {
  return (
    <section className="border border-white/[0.08] bg-white/[0.02] p-6 animate-pulse">
      <div className="h-3 w-40 bg-white/[0.06] rounded mb-3" />
      <div className="h-6 w-72 bg-white/[0.08] mb-6" />
      <div className="grid grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-white/[0.04]" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-white/[0.04]" />
        ))}
      </div>
    </section>
  );
}

export function ForesightEmptyState({ depth }: { depth?: string }) {
  return (
    <section className="border border-white/[0.06] bg-black/20 p-5 text-sm text-white/45">
      <p className="font-mono text-[10px] uppercase tracking-wider text-white/50 mb-2">
        Prospective Engine
      </p>
      <p>
        {depth === "standard" || depth === "surface"
          ? "Probabilistic foresight is available for Deep and Strategic briefs."
          : "No prospective distribution recorded for this publication. New strategic briefs include the foresight panel automatically."}
      </p>
    </section>
  );
}
