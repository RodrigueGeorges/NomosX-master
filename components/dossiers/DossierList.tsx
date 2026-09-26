import type { WatchedDossier } from "@/lib/queries/dossiers";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

function horizonLabel(h: string): string {
  return h.replace(/_/g, " ").toLowerCase();
}

export function DossierList({ dossiers }: { dossiers: WatchedDossier[] }) {
  if (dossiers.length === 0) {
    return (
      <p className="text-sm text-black/40">
        No dossier under active watch. Once a published analysis issues
        prospective claims, it appears here and stays under surveillance.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {dossiers.map((d) => (
        <article key={d.briefId} className="border border-black/10 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <a
                href={`/inquiry/${d.briefPublicId ?? d.briefId}`}
                className="text-base sm:text-lg font-semibold leading-snug hover:underline"
              >
                {d.question}
              </a>
              <p className="mt-1 text-[10px] font-mono uppercase tracking-wider text-black/40">
                Published {formatDate(d.publishedAt)} · Last activity {formatDate(d.lastActivity)}
              </p>
            </div>
            <div className="shrink-0 text-right text-[10px] font-mono uppercase tracking-wider">
              <p className="text-black/70">
                {d.openPredictions.length} open prediction{d.openPredictions.length === 1 ? "" : "s"}
              </p>
              {d.updates.length > 0 && (
                <p className="text-black/40">
                  {d.updates.length} update{d.updates.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-black/40 mb-2">
                Under surveillance
              </p>
              <ul className="space-y-2">
                {d.openPredictions.slice(0, 4).map((p) => (
                  <li key={p.id} className="text-xs text-black/60 leading-relaxed">
                    <span className="text-black/40">[{horizonLabel(p.horizon)}]</span>{" "}
                    {p.claim}
                    {p.probability != null && (
                      <span className="text-black/40"> — {Math.round(p.probability * 100)}%</span>
                    )}
                  </li>
                ))}
                {d.openPredictions.length === 0 && (
                  <li className="text-xs text-black/40">All predictions on this dossier resolved.</li>
                )}
              </ul>
            </div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-black/40 mb-2">
                Follow-up notes
              </p>
              {d.updates.length === 0 ? (
                <p className="text-xs text-black/40">
                  No trigger matched yet — the next signal reopens this dossier.
                </p>
              ) : (
                <ul className="space-y-2">
                  {d.updates.slice(0, 4).map((u) => (
                    <li key={u.id} className="text-xs leading-relaxed">
                      <a
                        href={`/inquiry/${u.publicId ?? u.id}`}
                        className="text-black/70 hover:text-black hover:underline"
                      >
                        {u.title}
                      </a>
                      <span className="text-black/40"> · {formatDate(u.publishedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
