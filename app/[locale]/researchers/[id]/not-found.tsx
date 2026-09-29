import Link from "next/link";
import { useLocale } from "next-intl";

export default function ResearcherNotFound() {
  const locale = useLocale();
  const fr = locale === "fr";

  return (
    <main className="max-w-4xl mx-auto px-6 py-20 sm:py-28 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-black/45 dark:text-white/45 mb-6">
        NomosX · {fr ? "Conseil" : "Council"}
      </p>
      <h1 className="font-display text-3xl sm:text-4xl font-medium text-black dark:text-white mb-4">
        {fr ? "Ce desk n'existe pas" : "No such desk"}
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-10 max-w-md mx-auto">
        {fr
          ? "L'identité recherchée ne fait pas partie du conseil NomosX."
          : "The desk you're looking for is not part of the NomosX council."}
      </p>
      <Link
        href={`/${locale}/researchers`}
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white underline underline-offset-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:focus-visible:ring-white/30"
      >
        {fr ? "← Retour au conseil" : "← Back to the council"}
      </Link>
    </main>
  );
}
