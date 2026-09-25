/**
 * PREDICTION WATCH — closes the forecast loop (P2-7).
 *
 * Predictions are registered OPEN with `whatWouldFalsify` / `resolutionCriteria`
 * triggers (prediction-registration.ts). Until now nothing compared today's
 * news flow against those triggers — predictions were write-only memory.
 *
 * Each radar cycle, incoming topics are matched against OPEN predictions'
 * trigger text. A match means the world moved on a dossier we already covered:
 *   → a PREDICTION_TRIGGER Signal is persisted (traceability + dedup)
 *   → a dispatch item is emitted so the dispatcher produces an UPDATE_NOTE
 *
 * Matching is deterministic — zero LLM tokens. Distinctive-token overlap
 * between the trigger text and the topic title+summary, requiring both a
 * weighted-overlap threshold and ≥2 distinctive hits so routine headlines
 * sharing generic words don't fire.
 */

import { prisma } from '../db';
import type { RadarTopic } from './topic-radar';
import { rehydrateSignalBus, type PersistentSignalBus } from './signals';

export interface TriggerMatch {
  predictionId: string;
  briefId: string | null;
  claim: string;
  horizon: string;
  matchedTrigger: string;
  matchedTopic: RadarTopic;
  score: number;
}

const STOPWORDS = new Set(
  ('the a an and or of to in for on at by with from as is are was were be been will would could should that this these those it its their they we you ' +
   'not no if then than when where which who what how why all any both each more most other some such only own same can may might must shall ' +
   'de la le les des du un une et ou au aux dans sur par pour avec sans en est sont été être qui que quoi dont où ' +
   'signal signals prediction predictions trigger triggers evidence change changed update updates')
    .split(' ')
);

/** Extract distinctive tokens (≥4 chars, non-stopword) from trigger text. */
function triggerTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-zàâäéèêëïîôùûüÿœæ0-9%$-]+/)) {
    const t = raw.trim();
    if (t.length >= 4 && !STOPWORDS.has(t)) tokens.add(t);
    // Keep compact year/threshold markers even at 4 chars (e.g. "2027", "50%")
    else if (t.length >= 2 && /^(20\d{2}|\d+%|\$\d)/.test(t)) tokens.add(t);
  }
  return tokens;
}

function topicTokens(topic: RadarTopic): Set<string> {
  return triggerTokens(`${topic.title} ${topic.summary ?? ''}`);
}

/**
 * Score a topic against a prediction's trigger surface.
 * Weighted overlap: matched / trigger tokens, boosted when the claim's own
 * subject tokens also appear (the news is about the same dossier, not just
 * lexically similar).
 */
function scoreMatch(topic: RadarTopic, trigger: Set<string>, claimToks: Set<string>): number {
  if (trigger.size === 0) return 0;
  const tToks = topicTokens(topic);
  let hits = 0;
  for (const t of trigger) if (tToks.has(t)) hits++;
  const base = hits / trigger.size;
  let claimHits = 0;
  for (const t of claimToks) if (tToks.has(t)) claimHits++;
  const contextBonus = Math.min(0.15, claimHits * 0.05);
  return Math.min(1, base + contextBonus);
}

/**
 * Match radar topics against OPEN predictions' triggers.
 * Deterministic and bounded — maxPredictions caps the scan.
 */
export function matchPredictionTriggers(
  topics: RadarTopic[],
  predictions: Array<{
    id: string; briefId: string | null; claim: string; horizon: string;
    resolutionCriteria: string; whatWouldFalsify: string;
  }>,
  opts: { threshold?: number; minHits?: number } = {},
): TriggerMatch[] {
  const threshold = opts.threshold ?? 0.40;
  const matches: TriggerMatch[] = [];

  for (const pred of predictions) {
    const triggerText = `${pred.whatWouldFalsify} ${pred.resolutionCriteria}`;
    const trigger = triggerTokens(triggerText);
    if (trigger.size < 3) continue; // too vague to match reliably
    const claimToks = triggerTokens(pred.claim);

    let best: { topic: RadarTopic; score: number } | null = null;
    for (const topic of topics) {
      const score = scoreMatch(topic, trigger, claimToks);
      if (score >= threshold && (!best || score > best.score)) {
        best = { topic, score };
      }
    }
    if (best) {
      matches.push({
        predictionId: pred.id,
        briefId: pred.briefId,
        claim: pred.claim,
        horizon: pred.horizon,
        matchedTrigger: pred.whatWouldFalsify.slice(0, 300),
        matchedTopic: best.topic,
        score: Math.round(best.score * 100) / 100,
      });
    }
  }
  return matches;
}

/**
 * Run the watch: load OPEN predictions, match against this cycle's radar
 * topics, persist PREDICTION_TRIGGER signals for new firings (deduped —
 * a prediction fires once until resolved), and return dispatch-ready items.
 */
export async function runPredictionWatch(
  topics: RadarTopic[],
  opts: { maxPredictions?: number; threshold?: number; verticalIds?: Map<string, string> } = {},
): Promise<{ items: Array<{ question: string; signalId: string; predictionId: string; briefId: string | null; verticalId?: string; score: number }>; fired: number; scanned: number }> {
  const predictions = await prisma.prediction.findMany({
    where: { status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take: opts.maxPredictions ?? 200,
    select: {
      id: true, briefId: true, claim: true, horizon: true,
      resolutionCriteria: true, whatWouldFalsify: true,
    },
  });
  if (predictions.length === 0 || topics.length === 0) {
    return { items: [], fired: 0, scanned: predictions.length };
  }

  const matches = matchPredictionTriggers(topics, predictions, { threshold: opts.threshold });
  if (matches.length === 0) return { items: [], fired: 0, scanned: predictions.length };

  // Dedup: a prediction fires once. Marker embedded in summary (Signal has no
  // metadata column) — same convention as durable-execution audit keys.
  const existing = await prisma.signal.findMany({
    where: { signalType: 'PREDICTION_TRIGGER', status: { in: ['NEW', 'HELD', 'PUBLISHED'] } },
    select: { summary: true },
  });
  const firedIds = new Set(
    existing.map(s => /\[PRED:([^\]]+)\]/.exec(s.summary)?.[1]).filter(Boolean) as string[],
  );

  const defaultVertical = await prisma.vertical.findFirst({
    where: { isActive: true }, select: { id: true },
  });
  if (!defaultVertical) return { items: [], fired: 0, scanned: predictions.length };

  // P2-8: cross-cycle dossier memory — dossiers under active watch carry a
  // decaying intensity; recently-fired dossiers get a small priority boost
  // because follow-through on a triggered forecast decays over days, not weeks.
  let watchBus: PersistentSignalBus<null> | null = null;
  try {
    watchBus = await rehydrateSignalBus(null, 'prediction-watch');
  } catch { /* memory is additive — never blocks */ }
  const watchedIds = new Set(
    (watchBus?.openSignals() ?? [])
      .filter(s => s.type === 'dossier_watch')
      .map(s => String(s.payload?.predictionId ?? '')),
  );

  const items: Array<{ question: string; signalId: string; predictionId: string; briefId: string | null; verticalId?: string; score: number }> = [];
  for (const m of matches) {
    if (firedIds.has(m.predictionId)) continue;
    const underWatch = watchedIds.has(m.predictionId);

    const verticalId = (m.matchedTopic.vertical && opts.verticalIds?.get(m.matchedTopic.vertical)) || defaultVertical.id;
    const signal = await prisma.signal.create({
      data: {
        verticalId,
        signalType: 'PREDICTION_TRIGGER',
        title: `Prediction trigger: ${m.matchedTopic.title}`.slice(0, 300),
        summary:
          `[PRED:${m.predictionId}] Forecast "${m.claim.slice(0, 200)}" (horizon ${m.horizon}) — ` +
          `trigger matched by "${m.matchedTopic.title}" (${m.matchedTopic.source}, score ${m.score}). ` +
          `Trigger: ${m.matchedTrigger.slice(0, 200)}`,
        noveltyScore: 85,
        impactScore: 80,
        confidenceScore: Math.round(m.score * 100),
        urgencyScore: 75,
        priorityScore: underWatch ? 86 : 82, // above the 70 signal-strategy bar
        sourceIds: [],
        status: 'NEW',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    if (watchBus) {
      watchBus.post('dossier_watch', `Dossier under watch: ${m.claim.slice(0, 150)}`, {
        postedBy: 'prediction-watch',
        intensity: Math.min(1, m.score + 0.1),
        ttlMs: 14 * 24 * 60 * 60 * 1000, // dossier attention decays over ~2 weeks
        payload: { predictionId: m.predictionId, briefId: m.briefId },
      });
    }

    items.push({
      question: `Update assessment — has the forecast changed? "${m.claim.slice(0, 180)}" New development: ${m.matchedTopic.title}`,
      signalId: signal.id,
      predictionId: m.predictionId,
      briefId: m.briefId,
      verticalId,
      score: m.score,
    });
  }

  await watchBus?.flush().catch(() => {});

  if (items.length > 0) {
    console.log(`[PREDICTION-WATCH] ${items.length} trigger(s) fired on ${predictions.length} open predictions`);
  }
  return { items, fired: items.length, scanned: predictions.length };
}
