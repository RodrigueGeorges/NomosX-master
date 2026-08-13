"use client";

import React, { useState } from "react";
import { Flag, Star, Check } from "lucide-react";

/**
 * ReaderFeedback — public accountability mechanism.
 * Lets readers report errors or rate the report.
 * No auth required — anyone can submit.
 */
export function ReaderFeedback({ publicationId }: { publicationId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"error" | "rating">("error");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body =
        mode === "error"
          ? { type: "error_report", message }
          : { type: "rating", rating };
      const res = await fetch(`/api/articles/${publicationId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Submission failed");
      }
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setOpen(false);
        setMessage("");
        setRating(0);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-16 pt-8 border-t border-white/[0.08]">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-white/70 uppercase tracking-wider">
          Reader Feedback
        </h3>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-xs text-white/50 hover:text-white/80 transition-colors flex items-center gap-1.5"
          aria-label="Toggle reader feedback form"
        >
          <Flag size={14} />
          {open ? "Close" : "Report an issue or rate"}
        </button>
      </div>

      {open && (
        <div className="mt-4 p-5 nx-public-surface">
          {submitted ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <Check size={16} /> Thank you — your feedback has been received.
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setMode("error")}
                  className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wide border transition-colors ${
                    mode === "error"
                      ? "border-white/25 text-white/90 bg-white/5"
                      : "border-white/[0.08] text-white/50 hover:text-white/70"
                  }`}
                >
                  Report Error
                </button>
                <button
                  type="button"
                  onClick={() => setMode("rating")}
                  className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wide border transition-colors ${
                    mode === "rating"
                      ? "border-white/25 text-white/90 bg-white/5"
                      : "border-white/[0.08] text-white/50 hover:text-white/70"
                  }`}
                >
                  Rate
                </button>
              </div>

              {mode === "error" ? (
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe the error or issue you found (citation, factual, methodological, etc.)..."
                  rows={4}
                  className="w-full bg-black/30 border border-white/[0.08] text-white/80 text-sm p-3 focus:border-white/25 focus:outline-none resize-none"
                  aria-label="Error report message"
                />
              ) : (
                <div className="flex items-center gap-2 py-2">
                  <span className="text-sm text-white/60 mr-2">Your rating:</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      className="transition-transform hover:scale-110"
                      aria-label={`Rate ${n} stars`}
                    >
                      <Star
                        size={22}
                        className={
                          n <= (hover || rating)
                            ? "fill-amber-400 text-amber-400"
                            : "text-white/20"
                        }
                      />
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <p role="alert" className="mt-3 text-xs text-rose-400">
                  {error}
                </p>
              )}

              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={submit}
                  disabled={
                    submitting ||
                    (mode === "error" && message.trim().length < 5) ||
                    (mode === "rating" && rating === 0)
                  }
                  className="px-4 py-2 text-xs font-mono uppercase tracking-wide border border-white/20 text-white/80 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
