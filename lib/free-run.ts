/**
 * NOMOSX_FREE_RUN=1 — zero-cost rehearsal mode.
 *
 * A full think-tank cycle exercises the orchestration (scout fan-out, durable
 * checkpoints, reclaim/resume, budgets, gates) without spending a cent:
 *  - unified-llm routes every call to the freepool cascade ($0)
 *  - the scout drops providers that meter paid API credits
 *  - embeddings are skipped (OpenAI/Cohere bill per token)
 *  - the dispatcher clamps maxPublications to 1
 *
 * Reads process.env directly so tests can toggle the flag per case.
 */
export function isFreeRun(): boolean {
  return process.env.NOMOSX_FREE_RUN === '1' || process.env.NOMOSX_FREE_RUN === 'true';
}

/**
 * Providers that meter paid/quota'd API credits. Everything else in the scout
 * registry is a free public endpoint (OpenAlex, Crossref, feeds, institutional
 * open data) or already quota-protected via the per-execution request budget.
 */
export const PAID_SCOUT_PROVIDERS = new Set<string>([
  // Metered web/news search
  'linkup', 'tavily', 'exa', 'apitube',
  'newsapi', 'mediastack', 'thenewsapi', 'gnews', 'eventregistry', 'newsdata',
  // Metered academic / grey literature
  'overton', 'dimensions', 'springer', 'lens',
]);

export function filterFreeRunProviders<T extends string>(providers: T[]): T[] {
  return providers.filter(p => !PAID_SCOUT_PROVIDERS.has(p));
}
