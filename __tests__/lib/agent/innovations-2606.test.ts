/**
 * Innovations batch — InfoDelphi evidence partition, confidence-weighted
 * aggregation, LEAP likelihood pooling, SEVA gate diagnoses.
 * All deterministic modules — no LLM, no DB.
 */

import { partitionEvidence, formatPartitionedSources } from '@/lib/agent/evidence-partition';
import { aggregateIndependentScores } from '@/lib/agent/confidence-aggregation';
import { evidenceLikelihoodUpdate, poolForecasts, toLogOdds, fromLogOdds } from '@/lib/agent/leap-aggregation';
import { diagnoseCheck, diagnoseGateResult, renderDiagnoses } from '@/lib/agent/gate-diagnosis';

describe('evidence-partition (InfoDelphi)', () => {
  const corpus = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}` }));

  it('partitions into shared pool + disjoint private slices', () => {
    const p = partitionEvidence(corpus, 3);
    expect(p.degenerate).toBe(false);
    expect(p.shared.length).toBe(10); // 50% of 20
    const privateTotal = p.privates.flat().length;
    expect(p.shared.length + privateTotal).toBe(20);
    // Private slices are disjoint
    const seen = new Set<string>();
    for (const slice of p.privates) for (const s of slice) {
      expect(seen.has(s.id)).toBe(false);
      seen.add(s.id);
    }
    // Every participant sees shared + its own private
    for (let i = 0; i < 3; i++) {
      const view = p.forParticipant(i);
      expect(view.length).toBe(p.shared.length + p.privates[i].length);
      expect(view.filter((s) => p.shared.includes(s)).length).toBe(p.shared.length);
    }
  });

  it('is deterministic — same corpus, same partition', () => {
    const a = partitionEvidence(corpus, 3);
    const b = partitionEvidence(corpus, 3);
    expect(a.shared.map((s) => s.id)).toEqual(b.shared.map((s) => s.id));
    expect(a.privates.map((sl) => sl.map((s) => s.id))).toEqual(b.privates.map((sl) => sl.map((s) => s.id)));
  });

  it('degenerates below minSources — everyone sees everything', () => {
    const p = partitionEvidence(corpus.slice(0, 5), 3);
    expect(p.degenerate).toBe(true);
    expect(p.forParticipant(0).length).toBe(5);
    expect(p.forParticipant(2).length).toBe(5);
  });

  it('formats shared + private blocks with the exclusivity marker', () => {
    const out = formatPartitionedSources(['a', 'b'], ['c']);
    expect(out).toContain('SHARED EVIDENCE');
    expect(out).toContain('PRIVATE EVIDENCE');
    expect(out).toContain('exclusive');
  });
});

describe('confidence-aggregation (independent scoring)', () => {
  it('falls back to fixed weights without confidence', () => {
    const r = aggregateIndependentScores(
      [{ score: 80 }, { score: 60 }, { score: 40 }],
      [0.35, 0.35, 0.3],
    );
    expect(r.composite).toBe(Math.round(80 * 0.35 + 60 * 0.35 + 40 * 0.3));
    expect(r.fellBackToFixed).toBe(true);
  });

  it('weights by declared confidence', () => {
    const r = aggregateIndependentScores([
      { score: 90, confidence: 90 },
      { score: 30, confidence: 20 },
    ]);
    expect(r.composite).toBeGreaterThan(70); // confident judge dominates
    expect(r.fellBackToFixed).toBe(false);
    expect(r.weights[0]).toBeGreaterThan(r.weights[1]);
  });

  it('clamps confidence to [20,95] — no judge drowns the panel', () => {
    const r = aggregateIndependentScores([
      { score: 100, confidence: 100 },
      { score: 0, confidence: 100 },
    ]);
    expect(r.weights[0]).toBeCloseTo(r.weights[1], 5); // both clamp to 95
    expect(r.composite).toBe(50);
  });

  it('reports dispersion for disagreement auditing', () => {
    const tight = aggregateIndependentScores([{ score: 70 }, { score: 72 }]);
    const wide = aggregateIndependentScores([{ score: 20 }, { score: 95 }]);
    expect(wide.dispersion).toBeGreaterThan(tight.dispersion);
  });
});

describe('leap-aggregation (likelihood → posterior)', () => {
  it('log-odds round-trips', () => {
    expect(fromLogOdds(toLogOdds(0.7))).toBeCloseTo(0.7, 3);
  });

  it('strong supporting sources raise the posterior', () => {
    const upd = evidenceLikelihoodUpdate(0.5, [
      { ref: 1, qualityScore: 90 },
      { ref: 2, qualityScore: 85 },
    ]);
    expect(upd.posterior).toBeGreaterThan(upd.prior);
    expect(upd.contributions.length).toBe(2);
  });

  it('weak sources count against', () => {
    // A single weak source barely moves the prior (conservative by design);
    // a prediction resting on several poor sources loses real ground.
    const upd = evidenceLikelihoodUpdate(0.7, [
      { ref: 1, qualityScore: 10 },
      { ref: 2, qualityScore: 15 },
      { ref: 3, qualityScore: 5 },
    ]);
    expect(upd.posterior).toBeLessThan(upd.prior);
  });

  it('pools forecasts via confidence-weighted log-odds', () => {
    const pooled = poolForecasts([
      { claim: 'c', probability: 0.8, confidence: 90 },
      { claim: 'c', probability: 0.6, confidence: 50 },
      { claim: 'c', probability: 0.7, confidence: 30 },
    ]);
    expect(pooled).not.toBeNull();
    expect(pooled!.pooled).toBeGreaterThan(0.6);
    expect(pooled!.pooled).toBeLessThan(0.8);
    expect(pooled!.votes).toBe(3);
    expect(pooled!.contested).toBe(false);
  });

  it('flags contested forecasts when votes straddle 0.5', () => {
    const pooled = poolForecasts([
      { claim: 'c', probability: 0.7 },
      { claim: 'c', probability: 0.3 },
    ]);
    expect(pooled!.contested).toBe(true);
  });
});

describe('gate-diagnosis (SEVA typed output)', () => {
  it('maps terminal evidence failures', () => {
    const d = diagnoseCheck({ checkType: 'source_depth', passed: false, details: '3/12 sources' });
    expect(d.severity).toBe('terminal');
    expect(d.code).toBe('EVIDENCE_INSUFFICIENT');
    expect(d.fix).toMatch(/replace the topic/i);
  });

  it('maps adversarial failures with actionable fix', () => {
    const d = diagnoseCheck({ checkType: 'fatal_challenges', passed: false, details: '2 fatal' });
    expect(d.category).toBe('adversarial');
    expect(d.fix).toBeTruthy();
  });

  it('unknown checkTypes get the default advisory diagnosis', () => {
    const d = diagnoseCheck({ checkType: 'mystery_check', passed: false, details: '' });
    expect(d.code).toBe('UNCLASSIFIED_FAILURE');
  });

  it('diagnoseGateResult only reports failing checks', () => {
    const out = diagnoseGateResult([
      { checkType: 'trust_score', passed: false, details: '' },
      { checkType: 'word_count', passed: true, details: '' },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].checkType).toBe('trust_score');
  });

  it('renders a compact fix block', () => {
    const s = renderDiagnoses(diagnoseGateResult([
      { checkType: 'devils_advocate', passed: false, details: '' },
    ]));
    expect(s).toContain('DA_PUBLISHABILITY_LOW');
  });
});
