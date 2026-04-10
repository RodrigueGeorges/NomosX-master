import { computeQualityScore, computeNoveltyScore } from '../score';

describe('computeQualityScore', () => {
  it('should give max recency score for current year papers', () => {
    const currentYear = new Date().getFullYear();
    const source = {
      year: currentYear,
      citationCount: 0,
      oaStatus: null,
      provider: 'openalex',
      type: 'paper',
      hasInstitution: false,
    };
    
    const score = computeQualityScore(source);
    expect(score).toBeGreaterThanOrEqual(42); // Max recency score
  });

  it('should penalize old papers significantly', () => {
    const oldSource = {
      year: 1990,
      citationCount: 100,
      oaStatus: null,
      provider: 'openalex',
      type: 'paper',
      hasInstitution: false,
    };
    
    const newSource = {
      year: new Date().getFullYear(),
      citationCount: 100,
      oaStatus: null,
      provider: 'openalex',
      type: 'paper',
      hasInstitution: false,
    };
    
    const oldScore = computeQualityScore(oldSource);
    const newScore = computeQualityScore(newSource);
    
    expect(newScore).toBeGreaterThan(oldScore);
  });

  it('should reward highly cited papers', () => {
    const source = {
      year: new Date().getFullYear() - 2,
      citationCount: 1000,
      oaStatus: null,
      provider: 'openalex',
      type: 'paper',
      hasInstitution: false,
    };
    
    const score = computeQualityScore(source);
    expect(score).toBeGreaterThan(50);
  });

  it('should give bonus for Open Access', () => {
    const year = new Date().getFullYear() - 1;
    
    const closedSource = {
      year,
      citationCount: 50,
      oaStatus: null,
      provider: 'openalex',
      type: 'paper',
      hasInstitution: false,
    };
    
    const openSource = {
      year,
      citationCount: 50,
      oaStatus: 'gold',
      provider: 'openalex',
      type: 'paper',
      hasInstitution: false,
    };
    
    const closedScore = computeQualityScore(closedSource);
    const openScore = computeQualityScore(openSource);
    
    expect(openScore).toBe(closedScore + 14); // OA bonus
  });

  it('should give bonus for institutional affiliation', () => {
    const year = new Date().getFullYear() - 1;
    
    const noInstSource = {
      year,
      citationCount: 50,
      oaStatus: null,
      provider: 'openalex',
      type: 'paper',
      hasInstitution: false,
    };
    
    const instSource = {
      year,
      citationCount: 50,
      oaStatus: null,
      provider: 'openalex',
      type: 'paper',
      hasInstitution: true,
    };
    
    const noInstScore = computeQualityScore(noInstSource);
    const instScore = computeQualityScore(instSource);
    
    expect(instScore).toBe(noInstScore + 6); // Institution bonus
  });

  it('should give bonus for theses', () => {
    const year = new Date().getFullYear() - 1;
    
    const paperSource = {
      year,
      citationCount: 10,
      oaStatus: null,
      provider: 'openalex',
      type: 'paper',
      hasInstitution: false,
    };
    
    const thesisSource = {
      year,
      citationCount: 10,
      oaStatus: null,
      provider: 'thesesfr',
      type: 'thesis',
      hasInstitution: false,
    };
    
    const paperScore = computeQualityScore(paperSource);
    const thesisScore = computeQualityScore(thesisSource);
    
    expect(thesisScore).toBe(paperScore + 4); // Thesis bonus
  });

  it('should cap score at 100', () => {
    const perfectSource = {
      year: new Date().getFullYear(),
      citationCount: 100000,
      oaStatus: 'gold',
      provider: 'semanticscholar',
      type: 'thesis',
      hasInstitution: true,
    };
    
    const score = computeQualityScore(perfectSource);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should floor score at 0', () => {
    const poorSource = {
      year: 1900,
      citationCount: 0,
      oaStatus: null,
      provider: 'openalex',
      type: 'paper',
      hasInstitution: false,
    };
    
    const score = computeQualityScore(poorSource);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('computeNoveltyScore', () => {
  it('should reward very recent papers', () => {
    const veryRecent = {
      year: new Date().getFullYear(),
      citationCount: 5,
      createdAt: new Date(),
    };
    
    const older = {
      year: new Date().getFullYear() - 3,
      citationCount: 5,
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    };
    
    const recentScore = computeNoveltyScore(veryRecent);
    const olderScore = computeNoveltyScore(older);
    
    expect(recentScore).toBeGreaterThan(olderScore);
  });

  it('should reward under-cited papers (emerging)', () => {
    const year = new Date().getFullYear() - 1;
    const createdAt = new Date();
    
    const mainstream = {
      year,
      citationCount: 1000,
      createdAt,
    };
    
    const emerging = {
      year,
      citationCount: 2,
      createdAt,
    };
    
    const mainstreamScore = computeNoveltyScore(mainstream);
    const emergingScore = computeNoveltyScore(emerging);
    
    expect(emergingScore).toBeGreaterThan(mainstreamScore);
  });

  it('should reward recently ingested sources', () => {
    const year = new Date().getFullYear() - 1;
    
    const old = {
      year,
      citationCount: 10,
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    };
    
    const fresh = {
      year,
      citationCount: 10,
      createdAt: new Date(),
    };
    
    const oldScore = computeNoveltyScore(old);
    const freshScore = computeNoveltyScore(fresh);
    
    expect(freshScore).toBeGreaterThan(oldScore);
  });

  it('should cap novelty score at 100', () => {
    const perfectNovel = {
      year: new Date().getFullYear(),
      citationCount: 0,
      createdAt: new Date(),
    };
    
    const score = computeNoveltyScore(perfectNovel);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should floor novelty score at 0', () => {
    const poorNovel = {
      year: 1900,
      citationCount: 100000,
      createdAt: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000),
    };
    
    const score = computeNoveltyScore(poorNovel);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
