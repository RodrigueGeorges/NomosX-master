/**
 * Source Scoring Functions
 */

function scoreSource(source) {
  let score = 50;
  
  // Quality indicators
  if (source.doi) score += 10;
  if (source.authors && source.authors.length > 0) score += 10;
  if (source.abstract && source.abstract.length > 100) score += 10;
  if (source.citationCount && source.citationCount > 10) score += 10;
  
  // Recency
  if (source.publishedAt) {
    const ageYears = (Date.now() - new Date(source.publishedAt)) / (1000 * 60 * 60 * 24 * 365);
    if (ageYears < 1) score += 10;
    else if (ageYears < 3) score += 5;
  }
  
  return Math.min(score, 100);
}

function scoreNovelty(source) {
  let score = 50;
  
  // Novelty indicators
  if (source.publishedAt) {
    const ageMonths = (Date.now() - new Date(source.publishedAt)) / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths < 1) score += 30;
    else if (ageMonths < 6) score += 20;
    else if (ageMonths < 12) score += 10;
  }
  
  // Citation growth
  if (source.citationCount) {
    if (source.citationCount > 50) score += 20;
    else if (source.citationCount > 10) score += 10;
  }
  
  return Math.min(score, 100);
}

export { scoreSource, scoreNovelty };
