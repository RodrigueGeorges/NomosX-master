/**
 * QUANTITATIVE DATA EXTRACTOR - A+ LEVEL ANALYSIS
 * 
 * Extraction automatique de données quantitatives des sources
 * pour atteindre les standards de publications A+
 */

export interface QuantitativeData {
  percentages: number[];
  monetaryValues: number[];
  growthRates: number[];
  statisticalValues: {
    pValues: number[];
    confidenceIntervals: string[];
    correlations: number[];
    standardDeviations: number[];
  };
  sampleSizes: number[];
  timeSeries: {
    years: number[];
    values: number[];
  }[];
  comparisons: {
    baseline: number;
    treatment: number;
    effect: number;
  }[];
}

export interface ExtractedMetrics {
  totalDataPoints: number;
  dataTypes: string[];
  qualityScore: number;
  reliability: 'high' | 'medium' | 'low';
  summary: string;
}

/**
 * Extract quantitative data from source content
 */
export function extractQuantitativeData(source: any): {
  data: QuantitativeData;
  metrics: ExtractedMetrics;
} {
  const content = `${source.title || ''} ${source.abstract || ''} ${source.content || ''}`;
  
  // Initialize data structure
  const data: QuantitativeData = {
    percentages: [],
    monetaryValues: [],
    growthRates: [],
    statisticalValues: {
      pValues: [],
      confidenceIntervals: [],
      correlations: [],
      standardDeviations: []
    },
    sampleSizes: [],
    timeSeries: [],
    comparisons: []
  };
  
  // Extract percentages
  const percentageMatches = content.match(/(\d+(?:\.\d+)?)%/g);
  if (percentageMatches) {
    data.percentages = percentageMatches.map(match => parseFloat(match.replace('%', '')));
  }
  
  // Extract monetary values
  const monetaryMatches = content.match(/\$[\d,]+(?:\.\d+)?/g);
  if (monetaryMatches) {
    data.monetaryValues = monetaryMatches.map(match => 
      parseFloat(match.replace(/[$,]/g, ''))
    );
  }
  
  // Extract growth rates and changes
  const growthMatches = content.match(/(\d+(?:\.\d+)?)\s*(?:%?\s*(?:increase|decrease|growth|decline|change))/gi);
  if (growthMatches) {
    data.growthRates = growthMatches.map(match => parseFloat(match.match(/(\d+(?:\.\d+)?)/)![1]));
  }
  
  // Extract statistical values
  extractStatisticalValues(content, data);
  
  // Extract sample sizes
  const sampleMatches = content.match(/(?:sample|n|N)\s*=?\s*(\d+(?:,\d{3})*)/gi);
  if (sampleMatches) {
    data.sampleSizes = sampleMatches.map(match => 
      parseInt(match.match(/(\d+(?:,\d{3})*)/)![1].replace(/,/g, ''))
    );
  }
  
  // Extract comparisons
  extractComparisons(content, data);
  
  // Calculate metrics
  const metrics = calculateDataMetrics(data, content);
  
  return { data, metrics };
}

/**
 * Extract statistical values from content
 */
function extractStatisticalValues(content: string, data: QuantitativeData): void {
  // P-values
  const pValueMatches = content.match(/p-value?\s*[<≤]\s*(\d+(?:\.\d+)?)/gi);
  if (pValueMatches) {
    data.statisticalValues.pValues = pValueMatches.map(match => 
      parseFloat(match.match(/(\d+(?:\.\d+)?)/)![1])
    );
  }
  
  // Confidence intervals
  const ciMatches = content.match(/\[?(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\]?%?\s*(?:CI|confidence interval)/gi);
  if (ciMatches) {
    data.statisticalValues.confidenceIntervals = ciMatches.map(match => match);
  }
  
  // Correlation coefficients
  const corrMatches = content.match(/r\s*=\s*([+-]?\d+(?:\.\d+)?)/gi);
  if (corrMatches) {
    data.statisticalValues.correlations = corrMatches.map(match => 
      parseFloat(match.match(/([+-]?\d+(?:\.\d+)?)/)![1])
    );
  }
  
  // Standard deviations
  const sdMatches = content.match(/SD\s*=\s*(\d+(?:\.\d+)?)/gi);
  if (sdMatches) {
    data.statisticalValues.standardDeviations = sdMatches.map(match => 
      parseFloat(match.match(/(\d+(?:\.\d+)?)/)![1])
    );
  }
}

/**
 * Extract comparative data
 */
function extractComparisons(content: string, data: QuantitativeData): void {
  // Look for before/after, control/treatment comparisons
  const comparisonPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:vs|versus)\s*(\d+(?:\.\d+)?)/gi,
    /(\d+(?:\.\d+)?)\s*(?:to|from)\s*(\d+(?:\.\d+)?)/gi,
    /(\d+(?:\.\d+)?)\s*(?:before|baseline)\s*(?:and|to)\s*(\d+(?:\.\d+)?)\s*(?:after|treatment)/gi
  ];
  
  comparisonPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const numbers = match.match(/(\d+(?:\.\d+)?)/g);
        if (numbers && numbers.length >= 2) {
          const baseline = parseFloat(numbers[0]);
          const treatment = parseFloat(numbers[1]);
          const effect = treatment - baseline;
          
          data.comparisons.push({
            baseline,
            treatment,
            effect
          });
        }
      });
    }
  });
}

/**
 * Calculate data quality metrics
 */
function calculateDataMetrics(data: QuantitativeData, content: string): ExtractedMetrics {
  // Count total data points
  const totalDataPoints = 
    data.percentages.length +
    data.monetaryValues.length +
    data.growthRates.length +
    data.statisticalValues.pValues.length +
    data.statisticalValues.confidenceIntervals.length +
    data.statisticalValues.correlations.length +
    data.statisticalValues.standardDeviations.length +
    data.sampleSizes.length +
    data.comparisons.length;
  
  // Identify data types present
  const dataTypes: string[] = [];
  if (data.percentages.length > 0) dataTypes.push('percentages');
  if (data.monetaryValues.length > 0) dataTypes.push('monetary');
  if (data.growthRates.length > 0) dataTypes.push('growth_rates');
  if (data.statisticalValues.pValues.length > 0) dataTypes.push('statistical');
  if (data.sampleSizes.length > 0) dataTypes.push('sample_sizes');
  if (data.comparisons.length > 0) dataTypes.push('comparisons');
  
  // Calculate quality score based on diversity and reliability
  let qualityScore = 0;
  
  // Base score for data quantity
  qualityScore += Math.min(totalDataPoints * 2, 30); // Max 30 points for quantity
  
  // Diversity bonus
  qualityScore += dataTypes.length * 5; // 5 points per data type, max 30
  
  // Statistical rigor bonus
  if (data.statisticalValues.pValues.length > 0) qualityScore += 10;
  if (data.statisticalValues.confidenceIntervals.length > 0) qualityScore += 10;
  if (data.sampleSizes.length > 0) qualityScore += 10;
  
  // Reliability assessment
  let reliability: 'high' | 'medium' | 'low' = 'low';
  if (qualityScore >= 70 && dataTypes.length >= 3) {
    reliability = 'high';
  } else if (qualityScore >= 40 && dataTypes.length >= 2) {
    reliability = 'medium';
  }
  
  // Generate summary
  const summary = generateDataSummary(data, totalDataPoints, dataTypes);
  
  return {
    totalDataPoints,
    dataTypes,
    qualityScore: Math.min(qualityScore, 100),
    reliability,
    summary
  };
}

/**
 * Generate human-readable summary of quantitative data
 */
function generateDataSummary(data: QuantitativeData, totalPoints: number, dataTypes: string[]): string {
  const summaries: string[] = [];
  
  if (data.percentages.length > 0) {
    const avgPercentage = data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length;
    summaries.push(`${data.percentages.length} percentage values (avg: ${avgPercentage.toFixed(1)}%)`);
  }
  
  if (data.monetaryValues.length > 0) {
    const totalMonetary = data.monetaryValues.reduce((a, b) => a + b, 0);
    summaries.push(`${data.monetaryValues.length} monetary values (total: $${totalMonetary.toFixed(2)})`);
  }
  
  if (data.growthRates.length > 0) {
    const avgGrowth = data.growthRates.reduce((a, b) => a + b, 0) / data.growthRates.length;
    summaries.push(`${data.growthRates.length} growth rates (avg: ${avgGrowth.toFixed(1)}%)`);
  }
  
  if (data.statisticalValues.pValues.length > 0) {
    const significantPValues = data.statisticalValues.pValues.filter(p => p < 0.05).length;
    summaries.push(`${data.statisticalValues.pValues.length} p-values (${significantPValues} significant)`);
  }
  
  if (data.sampleSizes.length > 0) {
    const avgSampleSize = data.sampleSizes.reduce((a, b) => a + b, 0) / data.sampleSizes.length;
    summaries.push(`${data.sampleSizes.length} sample sizes (avg: ${Math.round(avgSampleSize)})`);
  }
  
  if (data.comparisons.length > 0) {
    const avgEffect = data.comparisons.reduce((a, b) => a + b.effect, 0) / data.comparisons.length;
    summaries.push(`${data.comparisons.length} comparisons (avg effect: ${avgEffect.toFixed(2)})`);
  }
  
  return `Analysis reveals ${totalPoints} quantitative data points across ${dataTypes.length} types: ${summaries.join(', ')}.`;
}

/**
 * Generate quantitative insights for brief
 */
export function generateQuantitativeInsights(extractedData: { data: QuantitativeData; metrics: ExtractedMetrics }): string {
  const { data, metrics } = extractedData;
  const insights: string[] = [];
  
  // Percentage insights
  if (data.percentages.length >= 3) {
    const maxPercentage = Math.max(...data.percentages);
    const minPercentage = Math.min(...data.percentages);
    insights.push(`Quantitative analysis shows percentage values ranging from ${minPercentage}% to ${maxPercentage}%, indicating significant variation across measures.`);
  }
  
  // Monetary insights
  if (data.monetaryValues.length >= 2) {
    const totalMonetary = data.monetaryValues.reduce((a, b) => a + b, 0);
    const avgMonetary = totalMonetary / data.monetaryValues.length;
    insights.push(`Financial data reveals ${data.monetaryValues.length} monetary values totaling $${totalMonetary.toFixed(2)} (average: $${avgMonetary.toFixed(2)}).`);
  }
  
  // Growth insights
  if (data.growthRates.length >= 2) {
    const positiveGrowth = data.growthRates.filter(r => r > 0).length;
    const avgGrowth = data.growthRates.reduce((a, b) => a + b, 0) / data.growthRates.length;
    insights.push(`Growth analysis indicates ${positiveGrowth} positive changes out of ${data.growthRates.length} measurements, with an average growth rate of ${avgGrowth.toFixed(1)}%.`);
  }
  
  // Statistical significance insights
  if (data.statisticalValues.pValues.length > 0) {
    const significantPValues = data.statisticalValues.pValues.filter(p => p < 0.05).length;
    const significanceRate = (significantPValues / data.statisticalValues.pValues.length) * 100;
    insights.push(`Statistical analysis shows ${significantPValues} statistically significant findings out of ${data.statisticalValues.pValues.length} tests (${significanceRate.toFixed(1)}% significance rate).`);
  }
  
  // Sample size insights
  if (data.sampleSizes.length > 0) {
    const totalSampleSize = data.sampleSizes.reduce((a, b) => a + b, 0);
    const avgSampleSize = totalSampleSize / data.sampleSizes.length;
    insights.push(`Sample size analysis encompasses ${totalSampleSize.toLocaleString()} total observations across ${data.sampleSizes.length} studies (average: ${Math.round(avgSampleSize).toLocaleString()} per study).`);
  }
  
  // Comparative insights
  if (data.comparisons.length >= 2) {
    const positiveEffects = data.comparisons.filter(c => c.effect > 0).length;
    const avgEffect = data.comparisons.reduce((a, b) => a + b.effect, 0) / data.comparisons.length;
    insights.push(`Comparative analysis reveals ${positiveEffects} positive effects out of ${data.comparisons.length} comparisons, with an average effect size of ${avgEffect.toFixed(2)}.`);
  }
  
  // Overall reliability assessment
  if (metrics.reliability === 'high') {
    insights.push(`The quantitative evidence base demonstrates high reliability with a quality score of ${metrics.qualityScore}/100, supporting robust conclusions.`);
  } else if (metrics.reliability === 'medium') {
    insights.push(`The quantitative evidence shows moderate reliability (score: ${metrics.qualityScore}/100), suggesting cautious interpretation of findings.`);
  } else {
    insights.push(`Limited quantitative data availability (score: ${metrics.qualityScore}/100) indicates need for additional empirical evidence to strengthen conclusions.`);
  }
  
  return insights.join(' ');
}
