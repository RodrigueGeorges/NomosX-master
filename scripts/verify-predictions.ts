/**
 * Verify Predictions — Monthly script to check OPEN predictions against reality.
 *
 * Inspired by:
 * - IARPA Good Judgment Project: tournament-based scoring
 * - Tetlock: superforecaster calibration requires feedback loops
 *
 * This script:
 * 1. Finds OPEN predictions whose horizon has elapsed
 * 2. Uses an LLM to assess whether the prediction was confirmed, refuted, or expired
 * 3. Updates the prediction status in the database
 *
 * Run monthly via cron: `node --import tsx scripts/verify-predictions.ts`
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { prisma } from '../lib/db';
import { callLLM } from '../lib/llm/unified-llm';
import { parseJson } from '../lib/agent/json-utils';

interface VerificationResult {
  status: 'CONFIRMED' | 'REFUTED' | 'EXPIRED';
  outcome: string;
  reasoning: string;
}

/**
 * Parse a horizon string and determine if it has elapsed.
 * Examples: "2027-Q2", "2028", "5-10 years", "6 months", "2029-2030"
 */
function hasHorizonElapsed(horizon: string, createdAt: Date): boolean {
  const now = new Date();
  const lower = horizon.toLowerCase().trim();

  // Year-only: "2028"
  const yearMatch = lower.match(/^(\d{4})$/);
  if (yearMatch) {
    return now.getFullYear() >= parseInt(yearMatch[1]);
  }

  // Year range: "2029-2030"
  const rangeMatch = lower.match(/^(\d{4})-(\d{4})$/);
  if (rangeMatch) {
    return now.getFullYear() >= parseInt(rangeMatch[2]);
  }

  // Quarter: "2027-Q2"
  const quarterMatch = lower.match(/^(\d{4})-q(\d)$/);
  if (quarterMatch) {
    const year = parseInt(quarterMatch[1]);
    const quarter = parseInt(quarterMatch[2]);
    const elapsedQuarters = (now.getFullYear() - year) * 4 + (Math.floor(now.getMonth() / 3) + 1 - quarter);
    return elapsedQuarters >= 0;
  }

  // Relative: "6 months", "5-10 years", "1 year"
  const monthsMatch = lower.match(/(\d+)\s*months?/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1]);
    const elapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return elapsed >= months;
  }

  const yearsMatch = lower.match(/(\d+)(?:-(\d+))?\s*years?/);
  if (yearsMatch) {
    const years = parseInt(yearsMatch[2] || yearsMatch[1]);
    const elapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 365);
    return elapsed >= years;
  }

  // Unknown format — be conservative, don't auto-expire
  return false;
}

async function verifyPredictionWithLLM(claim: string, resolutionCriteria: string): Promise<VerificationResult> {
  const prompt = `You are a prediction verification analyst. Your task is to determine whether a geopolitical prediction has been confirmed, refuted, or expired based on current knowledge.

PREDICTION:
"${claim}"

RESOLUTION CRITERIA:
"${resolutionCriteria}"

Based on your knowledge of current events (up to your training data), determine:
1. Has the predicted event occurred? (CONFIRMED)
2. Has the opposite occurred, making the prediction clearly wrong? (REFUTED)
3. Has the time horizon passed without clear confirmation or refutation? (EXPIRED)

Return JSON:
{
  "status": "CONFIRMED" | "REFUTED" | "EXPIRED",
  "outcome": "What actually happened (1-2 sentences)",
  "reasoning": "Why this status (2-3 sentences)"
}`;

  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      jsonMode: true,
      maxTokens: 500,
      task: 'reader_v3',
    });

    const result = parseJson<VerificationResult>(response.content);
    if (result && ['CONFIRMED', 'REFUTED', 'EXPIRED'].includes(result.status)) {
      return result;
    }
  } catch (err) {
    console.warn(`[VerifyPredictions] LLM failed for prediction:`, String(err).slice(0, 80));
  }

  // Fallback: mark as EXPIRED if horizon elapsed
  return {
    status: 'EXPIRED',
    outcome: 'Time horizon elapsed without clear resolution.',
    reasoning: 'LLM verification unavailable; auto-expired.',
  };
}

async function verifyPredictions() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Verify Predictions — Monthly Track Record Update          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const openPredictions = await prisma.prediction.findMany({
    where: { status: 'OPEN' },
    select: { id: true, claim: true, horizon: true, probability: true, resolutionCriteria: true, createdAt: true },
  });

  console.log(`  Open predictions: ${openPredictions.length}`);

  // Filter to predictions whose horizon has elapsed
  const eligible = openPredictions.filter(p => hasHorizonElapsed(p.horizon, p.createdAt));
  console.log(`  Eligible for verification (horizon elapsed): ${eligible.length}`);

  if (eligible.length === 0) {
    console.log('  ⏭️  No predictions to verify this cycle.');
    await prisma.$disconnect();
    return;
  }

  let confirmed = 0, refuted = 0, expired = 0;

  for (const pred of eligible) {
    console.log(`  Verifying: ${pred.claim.slice(0, 80)}...`);
    const result = await verifyPredictionWithLLM(pred.claim, pred.resolutionCriteria);

    await prisma.prediction.update({
      where: { id: pred.id },
      data: {
        status: result.status,
        outcome: result.outcome,
        resolutionNotes: result.reasoning,
        resolvedAt: new Date(),
      },
    });

    if (result.status === 'CONFIRMED') confirmed++;
    else if (result.status === 'REFUTED') refuted++;
    else expired++;

    console.log(`    → ${result.status}: ${result.outcome.slice(0, 60)}...`);

    // Rate limit: 500ms between LLM calls
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n  ✅ Verification complete: ${confirmed} confirmed, ${refuted} refuted, ${expired} expired`);

  // Compute and display updated Brier score
  const resolved = await prisma.prediction.findMany({
    where: { status: { in: ['CONFIRMED', 'REFUTED', 'EXPIRED'] }, probability: { not: null } },
    select: { probability: true, status: true },
  });

  if (resolved.length > 0) {
    const brierSum = resolved.reduce((sum, p) => {
      const outcome = p.status === 'CONFIRMED' ? 1 : 0;
      return sum + Math.pow((p.probability ?? 0.5) - outcome, 2);
    }, 0);
    const brier = brierSum / resolved.length;
    console.log(`  📊 Updated Brier score: ${brier.toFixed(3)} (n=${resolved.length})`);
  }

  await prisma.$disconnect();
}

verifyPredictions().catch(console.error);
