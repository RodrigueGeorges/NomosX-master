"use client";

export function ForesightPanelSkeleton() {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-bg-elevated p-6 animate-pulse">
      <div className="h-3 w-40 bg-white/[0.06] rounded mb-3" />
      <div className="h-6 w-72 bg-white/[0.08] rounded mb-6" />
      <div className="grid grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-white/[0.04] rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-white/[0.04] rounded-xl" />
        ))}
      </div>
    </section>
  );
}

export function ForesightEmptyState({ depth }: { depth?: string }) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-black/20 p-5 text-sm text-white/45">
      <p className="font-mono text-[10px] uppercase tracking-wider text-white/30 mb-2">
        Foresight Engine
      </p>
      <p>
        {depth === "standard" || depth === "surface"
          ? "La simulation multi-agent est disponible pour les inquiries Deep et Strategic."
          : "Aucune simulation enregistrée pour cette publication. Les nouvelles inquiries strategic incluront le panel Foresight automatiquement."}
      </p>
    </section>
  );
}
