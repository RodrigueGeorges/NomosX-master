"use client";

export function ForesightPanelSkeleton() {
  return (
    <section className="border border-black/[0.08] bg-black/[0.02] p-6 animate-pulse">
      <div className="h-3 w-40 bg-black/[0.06] rounded mb-3" />
      <div className="h-6 w-72 bg-black/[0.08] mb-6" />
      <div className="grid grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-black/[0.04]" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-black/[0.04]" />
        ))}
      </div>
    </section>
  );
}

export function ForesightEmptyState({ depth }: { depth?: string }) {
  // Hide the empty state entirely — it's an internal pipeline artifact,
  // not something that should be shown to public readers.
  return null;
}
