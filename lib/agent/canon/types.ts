/**
 * Canon layer — curated foundational texts injected as interpretive
 * frameworks into the analyst context. This is the "mémoire exhaustive":
 * philosophy, sociology, political theory, economics, history, STS.
 *
 * Unlike live providers (which return metadata + abstracts), the canon
 * carries the *conceptual content* — each entry encodes the work's core
 * thesis so the analyst can use it as an analytical lens, not just a citation.
 */

export type CanonTradition =
  | 'philosophy'
  | 'political-theory'
  | 'sociology'
  | 'economics'
  | 'history'
  | 'strategy-ir'
  | 'anthropology'
  | 'sts'           // science & technology studies
  | 'ecology-risk';

export interface CanonEntry {
  /** Stable slug, e.g. 'polanyi-great-transformation' */
  id: string;
  author: string;
  /** Original title (EN canonical title preferred) */
  work: string;
  year: number;
  tradition: CanonTradition;
  /**
   * Conceptual hooks — the terms a query must resonate with for this work
   * to be relevant. Mix EN + FR since queries arrive in both languages.
   */
  concepts: string[];
  /** Pipeline domains this work illuminates ('*' = cross-cutting) */
  domains: string[];
  /**
   * The core argument in 1-2 sentences — this is what gets injected into
   * the analyst context, so it must be a usable analytical lens.
   */
  thesis: string;
}
