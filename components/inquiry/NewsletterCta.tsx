"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, Check } from "lucide-react";

/**
 * NewsletterCta — inline subscribe block at the foot of a publication.
 * Posts to /api/newsletter/subscribe (double opt-in, rate-limited server-side).
 */
export function NewsletterCta({ publicationId }: { publicationId: string }) {
  const t = useTranslations("Newsletter");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "article", referrer: publicationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setState("done");
        setMessage(data.message || t("ctaSuccess"));
      } else {
        setState("error");
        setMessage(data.error || t("ctaError"));
      }
    } catch {
      setState("error");
      setMessage(t("ctaError"));
    }
  }

  if (state === "done") {
    return (
      <div className="mt-10 border border-black/[0.12] dark:border-white/[0.12] p-6 print:hidden">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-black/60 dark:text-white/60">
          <Check size={14} />
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 border border-black/[0.12] dark:border-white/[0.12] p-6 print:hidden">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45 dark:text-white/45 mb-2">
        {t("ctaEyebrow")}
      </p>
      <p className="text-sm text-black/70 dark:text-white/70 mb-4 max-w-md">
        {t("ctaText")}
      </p>
      <form onSubmit={subscribe} className="flex gap-2 max-w-md">
        <label htmlFor="nl-cta-email" className="sr-only">
          {t("ctaPlaceholder")}
        </label>
        <input
          id="nl-cta-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("ctaPlaceholder")}
          className="flex-1 px-3 py-2 text-sm border border-black/[0.15] dark:border-white/[0.15] bg-transparent text-black dark:text-white placeholder:text-black/35 dark:placeholder:text-white/35 focus:outline-none focus:border-black/40 dark:focus:border-white/40"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-mono text-[11px] uppercase tracking-[0.14em] disabled:opacity-50 hover:opacity-85 transition-opacity"
        >
          <Mail size={13} />
          {state === "loading" ? "…" : t("ctaButton")}
        </button>
      </form>
      {state === "error" && (
        <p role="alert" className="mt-2 text-xs text-rose-500">{message}</p>
      )}
    </div>
  );
}
