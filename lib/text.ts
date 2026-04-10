
export function clamp(s: string, n = 4000) { return !s ? "" : (s.length > n ? s.slice(0, n - 1) + "…" : s); }
export function invertedIndexToText(inv?: Record<string, number[]>): string | null {
  if (!inv) return null;
  return Object.keys(inv).slice(0, 180).join(" ");
}
