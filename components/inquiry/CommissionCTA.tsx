"use client";

import { ArrowRight, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { PUBLICATION_FORMATS } from "@/lib/publication-formats";
import { getStudioXPrice } from "@/lib/studiox-pricing";
import { PUBLIC_ROUTES } from "@/lib/public-urls";
import { nx } from "@/lib/brand/public-ui";
import { cn } from "@/lib/utils";

/**
 * CTA displayed at the bottom of public publications.
 * Converts readers into paying clients by inviting them to commission
 * a custom study through Nomos Engine.
 *
 * Subtle, premium tone — no floating badge, no aggressive pop-up.
 * Just a clean encart after the content, showing the 4 formats with prices.
 */
export function CommissionCTA() {
  const router = useRouter();

  return (
    <div className="mt-12 nx-public-surface p-6 sm:p-8">
      <div className="text-center mb-6">
        <p className={cn(nx.eyebrow, "mb-3")}>Nomos Engine</p>
        <h3 className="font-display text-xl sm:text-2xl font-semibold text-white mb-2">
          Want the same rigor on your question?
        </h3>
        <p className={cn(nx.body, "max-w-lg mx-auto")}>
          This study was produced by Nomos Engine. Same protocol, same verification, same traceability — on your own question.
        </p>
      </div>

      <div className="grid sm:grid-cols-4 gap-2 mb-6">
        {PUBLICATION_FORMATS.map((format) => {
          const price = getStudioXPrice(format.type);
          return (
            <div key={format.type} className="nx-public-surface p-3 text-center">
              <div className="text-sm text-white/80 font-medium">{format.label}</div>
              <div className="text-[10px] text-white/40 font-mono mt-1">{format.pages}</div>
              <div className="text-base text-white font-bold font-mono mt-2">{price.display}</div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => router.push(PUBLIC_ROUTES.studio)}
          className={cn(nx.btnPrimary, "min-w-[240px]")}
        >
          Commission a study
          <ArrowRight size={14} className="ml-2" />
        </button>
        <div className="flex items-center gap-2 text-[11px] text-white/35">
          <Shield size={12} />
          <span>Money-back guarantee · No subscription · Secure checkout</span>
        </div>
      </div>
    </div>
  );
}
