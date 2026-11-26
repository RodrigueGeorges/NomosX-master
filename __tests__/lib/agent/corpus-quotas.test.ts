import {
  detectPolicyQuestion,
  hasDatedHorizon,
  classifyCorpusSource,
  evaluateCorpusQuotas,
  quotaScoutQueries,
  CorpusSourceLike,
} from '../../../lib/agent/corpus-quotas';

const NOW = new Date('2026-02-15T00:00:00Z'); // frozen "today" for tests

function src(partial: Partial<CorpusSourceLike>): CorpusSourceLike {
  return { id: 's', title: 'x', ...partial };
}

describe('detectPolicyQuestion', () => {
  it('detects public-policy questions in force', () => {
    expect(detectPolicyQuestion('Will the EU CBAM reduce embedded emissions by 2030?')).toBe(true);
    expect(detectPolicyQuestion('Impact of the carbon border adjustment mechanism on trade')).toBe(true);
    expect(detectPolicyQuestion('How will the Inflation Reduction Act subsidies affect solar deployment?')).toBe(true);
  });
  it('rejects non-policy questions', () => {
    expect(detectPolicyQuestion('Who will win the Nobel Prize in Physics?')).toBe(false);
    expect(detectPolicyQuestion('Best pizza in Naples')).toBe(false);
  });
  it('detects policy-domain questions phrased as forecasts/topics (run-11 gap)', () => {
    // Radar run 11: all 3 policy-relevant runs skipped quotas because the
    // operationalized question carried no policy keyword.
    expect(detectPolicyQuestion('Global renewable energy capacity reaches at least 50% of total installed electricity capacity by the end of 2030')).toBe(true);
    expect(detectPolicyQuestion('What are the critical mineral resource dependencies of the energy transition?')).toBe(true);
    expect(detectPolicyQuestion('Mineral Resource Dependencies')).toBe(true);
    // Still rejects genuinely non-policy domains
    expect(detectPolicyQuestion('What evidence exists on the empirical validation of structured consensus methods in guideline development?')).toBe(false);
  });
});

describe('hasDatedHorizon', () => {
  it('detects dated horizons', () => {
    expect(hasDatedHorizon('CBAM emissions by 2030')).toBe(true);
    expect(hasDatedHorizon('effect by 2027')).toBe(true);
    expect(hasDatedHorizon('what happens next?')).toBe(false);
  });
});

describe('classifyCorpusSource', () => {
  it('flags EUR-Lex regulation as regulatory', () => {
    const f = classifyCorpusSource(src({
      provider: 'eur-lex',
      title: 'Regulation (EU) 2025/2083 on CBAM definitive period',
      url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2083',
    }), NOW);
    expect(f.regulatory).toBe(true);
  });
  it('flags official-journal title pattern as regulatory even off-provider', () => {
    const f = classifyCorpusSource(src({
      title: 'Commission Delegated Regulation (EU) 2025/1234',
      url: 'https://example.com/doc.pdf',
    }), NOW);
    expect(f.regulatory).toBe(true);
  });
  it('flags recent implementation evidence (<18mo via year)', () => {
    const f = classifyCorpusSource(src({
      title: 'CBAM registry first annual report on embedded emissions',
      abstract: 'implementation and monitoring guidance for declarants',
      year: 2025,
      url: 'https://news.example.com/cbam-report',
    }), NOW);
    expect(f.implementationRecent).toBe(true);
  });
  it('does not flag old implementation material as recent', () => {
    const f = classifyCorpusSource(src({
      title: 'Implementation of the EU ETS directive review',
      year: 2019,
      url: 'https://old.example.com/ets',
    }), NOW);
    expect(f.implementationRecent).toBe(false);
  });
  it('flags ex-ante modelling studies', () => {
    const f = classifyCorpusSource(src({
      title: 'Ex-ante impact assessment of CBAM on EU competitiveness',
      abstract: 'CGE modelling study of carbon leakage',
    }), NOW);
    expect(f.exAnte).toBe(true);
  });
});

describe('evaluateCorpusQuotas', () => {
  const policyQ = 'Will the EU CBAM reduce embedded emissions by 2030?';
  const goodCorpus: CorpusSourceLike[] = [
    src({ id: 'r1', provider: 'eur-lex', title: 'Regulation (EU) 2025/2083 CBAM definitive regime', url: 'https://eur-lex.europa.eu/x' }),
    src({ id: 'r2', title: 'Directive (EU) 2023/959 ETS revision', url: 'https://eur-lex.europa.eu/y' }),
    src({ id: 'i1', title: 'CBAM first annual report implementation monitoring', year: 2025, url: 'https://impl.example.com' }),
    src({ id: 'e1', title: 'Ex-ante impact assessment CBAM CGE modelling', url: 'https://study1.example.com' }),
    src({ id: 'e2', title: 'Cost-benefit analysis of border carbon adjustment', abstract: 'general equilibrium model projections', url: 'https://study2.example.com' }),
    src({ id: 'c1' }), src({ id: 'c2' }), src({ id: 'c3' }),
  ];
  const stances = new Map<string, string>([
    ['c1', 'critical'], ['c2', 'critical'], ['c3', 'critical'],
  ]);

  it('met=true when all quotas filled on a dated-horizon policy question', () => {
    const r = evaluateCorpusQuotas({ query: policyQ, sources: goodCorpus, contraryStances: stances, now: NOW });
    expect(r.policyQuestion).toBe(true);
    expect(r.met).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.quotas.regulatory.count).toBeGreaterThanOrEqual(2);
    expect(r.quotas.exAnte.count).toBeGreaterThanOrEqual(2);
    expect(r.quotas.contrary.count).toBe(3);
  });

  it('missing regulatory + contrary when corpus lacks them', () => {
    const sparse = [src({ id: 'n1', title: 'News article about CBAM prices', year: 2025 })];
    const r = evaluateCorpusQuotas({ query: policyQ, sources: sparse, contraryStances: new Map(), now: NOW });
    expect(r.met).toBe(false);
    expect(r.missing).toContain('regulatory');
    expect(r.missing).toContain('contrary');
    expect(r.missing).toContain('exAnte'); // dated horizon requires ex-ante
  });

  it('exAnte not required without a dated horizon', () => {
    const q = 'What impact does the EU CBAM have on industrial competitiveness?';
    const corpus = goodCorpus.filter(s => !['e1', 'e2'].includes(s.id ?? ''));
    const stances2 = new Map<string, string>([
      ['r1', 'critical'], ['r2', 'critical'], ['i1', 'critical'],
    ]);
    const r = evaluateCorpusQuotas({ query: q, sources: corpus, contraryStances: stances2, now: NOW });
    expect(r.quotas.exAnte.required).toBe(0);
    // r1/r2 are regulatory+critical stances counted via ids
    expect(r.quotas.contrary.count).toBe(3);
    expect(r.met).toBe(true);
  });

  it('non-policy question → quotas do not apply', () => {
    const r = evaluateCorpusQuotas({ query: 'Who wins the chess championship 2026?', sources: [], now: NOW });
    expect(r.policyQuestion).toBe(false);
    expect(r.met).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('unmeasured contrary stance fails closed', () => {
    const r = evaluateCorpusQuotas({ query: policyQ, sources: goodCorpus, contraryStances: null, now: NOW });
    expect(r.quotas.contrary.count).toBe(0);
    expect(r.missing).toContain('contrary');
    expect(r.met).toBe(false);
  });
});

describe('quotaScoutQueries', () => {
  it('emits targeted queries per missing category, max two rounds', () => {
    const qs = quotaScoutQueries(['regulatory', 'contrary'], 'CBAM 2030 emissions');
    expect(qs.length).toBeLessThanOrEqual(2);
    expect(qs.some(q => q.includes('eur-lex'))).toBe(true);
    expect(qs.some(q => q.includes('critic') || q.includes('opposing'))).toBe(true);
    // three missing → only the two highest-priority categories get a round
    const qs3 = quotaScoutQueries(['regulatory', 'contrary', 'implementationRecent'], 'CBAM 2030 emissions');
    expect(qs3.length).toBe(2);
    expect(qs3.some(q => q.includes('eur-lex'))).toBe(true);
  });
  it('returns empty when nothing missing', () => {
    expect(quotaScoutQueries([], 'q')).toEqual([]);
  });
});
