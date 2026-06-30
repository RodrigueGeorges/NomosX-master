/**
 * Format Validator - Comprehensive validation for NomosX formats
 * Validates content against format specifications and LawZero standards
 */

import { prisma } from '@/lib/db';
import { countWords, validateWordCount, countWordsBySections, ValidationResult } from '@/lib/word-counter';
import { formatTitle, validateTitleFormat, parseTitle, scoreTitleQuality } from '@/lib/formatters/title-formatter';

export interface FormatValidationResult {
  isValid: boolean;
  formatId: number;
  formatName: string;
  tier: string;
  totalWords: number;
  targetWords: number;
  sections: SectionValidation[];
  titleValidation: TitleValidation;
  overallScore: number;
  errors: string[];
  warnings: string[];
  compliance: 'FULL' | 'PARTIAL' | 'FAILED';
  recommendations: string[];
}

export interface SectionValidation {
  name: string;
  wordTarget: number;
  actualWords: number;
  percentage: number;
  isValid: boolean;
  isRequired: boolean;
  isPresent: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

export interface TitleValidation {
  original: string;
  formatted: string;
  isValid: boolean;
  format: 'lawzero' | 'standard';
  concept: string;
  subtitle: string;
  score: number;
  issues: string[];
  suggestions: string[];
}

export interface ValidationOptions {
  tolerance?: number;
  strictMode?: boolean;
  includeSuggestions?: boolean;
  checkCitations?: boolean;
  checkMethodology?: boolean;
}

/**
 * Validate content against format specification
 */
export async function validateFormat(
  content: string,
  formatId: number,
  options: ValidationOptions = {}
): Promise<FormatValidationResult> {
  const {
    tolerance = 0.1,
    strictMode = false,
    includeSuggestions = true,
    checkCitations = false,
    checkMethodology = false
  } = options;
  
  // Get format configuration
  const format = await (prisma as any).publicationFormat?.findUnique({
    where: { id: formatId },
    include: { 
      sections: { 
        orderBy: { orderIndex: 'asc' } 
      } 
    }
  }) ?? null;
  
  if (!format) {
    throw new Error(`Format not found: ${formatId}`);
  }
  
  const result: FormatValidationResult = {
    isValid: true,
    formatId,
    formatName: format.name,
    tier: format.tier,
    totalWords: countWords(content),
    targetWords: format.totalWords,
    sections: [],
    titleValidation: {
      original: '',
      formatted: '',
      isValid: false,
      format: 'standard',
      concept: '',
      subtitle: '',
      score: 0,
      issues: [],
      suggestions: []
    },
    overallScore: 100,
    errors: [],
    warnings: [],
    compliance: 'FULL',
    recommendations: []
  };
  
  // Extract and validate title
  const title = extractTitle(content);
  const formattedTitle = formatTitle(title, { format: 'lawzero' });
  const titleScore = scoreTitleQuality(formattedTitle);
  
  result.titleValidation = {
    original: title,
    formatted: formattedTitle,
    isValid: validateTitleFormat(formattedTitle, 'lawzero'),
    ...parseTitle(formattedTitle),
    format: validateTitleFormat(formattedTitle, 'lawzero') ? 'lawzero' : 'standard',
    score: titleScore.score,
    issues: titleScore.issues,
    suggestions: titleScore.suggestions
  };
  
  if (!result.titleValidation.isValid) {
    result.isValid = false;
    result.errors.push('Title does not follow LawZero format [Concept]: [Subtitle]');
  }
  
  // Validate total word count
  const wordValidation = validateWordCount(content, format.totalWords, tolerance);
  if (!wordValidation.isValid) {
    result.isValid = false;
    result.errors.push(...wordValidation.errors);
  }
  result.warnings.push(...wordValidation.warnings);
  
  // Validate sections
  const sectionValidations = validateSections(content, format.sections, tolerance);
  result.sections = sectionValidations;
  
  // Check for missing required sections
  const missingRequired = sectionValidations.filter(s => s.isRequired && !s.isPresent);
  if (missingRequired.length > 0) {
    result.isValid = false;
    result.errors.push(`Missing required sections: ${missingRequired.map(s => s.name).join(', ')}`);
  }
  
  // Check section word distribution
  const invalidSections = sectionValidations.filter(s => !s.isValid);
  if (invalidSections.length > 0) {
    if (strictMode) {
      result.isValid = false;
    } else {
      result.warnings.push(`Section word count issues: ${invalidSections.map(s => s.name).join(', ')}`);
    }
  }
  
  // Check for citations if required
  if (checkCitations && format.validationRules && 
      JSON.parse(format.validationRules as string)?.citationsRequired) {
    const citationValidation = validateCitations(content);
    if (!citationValidation.isValid) {
      result.isValid = false;
      result.errors.push(...citationValidation.errors);
    }
    result.warnings.push(...citationValidation.warnings);
  }
  
  // Check for methodology if required
  if (checkMethodology && format.validationRules && 
      JSON.parse(format.validationRules as string)?.methodologyRequired) {
    const methodologyValidation = validateMethodology(content);
    if (!methodologyValidation.isValid) {
      result.isValid = false;
      result.errors.push(...methodologyValidation.errors);
    }
    result.warnings.push(...methodologyValidation.warnings);
  }
  
  // Calculate overall score
  result.overallScore = calculateOverallScore(result);
  
  // Determine compliance level
  if (!result.isValid) {
    result.compliance = 'FAILED';
  } else if (result.warnings.length > 0) {
    result.compliance = 'PARTIAL';
  } else {
    result.compliance = 'FULL';
  }
  
  // Generate recommendations
  if (includeSuggestions) {
    result.recommendations = generateRecommendations(result);
  }
  
  return result;
}

/**
 * Extract title from content
 */
function extractTitle(content: string): string {
  // Try different title patterns
  const patterns = [
    /<h1[^>]*>(.*?)<\/h1>/i,
    /<title[^>]*>(.*?)<\/title>/i,
    /^#\s+(.+)$/m,
    /^\*\*(.+)\*\*$/m
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  // Fallback to first line
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  return lines[0] || 'Untitled';
}

/**
 * Validate sections
 */
function validateSections(
  content: string, 
  sections: Array<{ 
    name: string; 
    wordTarget: number; 
    isRequired: boolean; 
    orderIndex: number;
  }>,
  tolerance: number = 0.1
): SectionValidation[] {
  return sections.map(section => {
    const sectionContent = extractSectionContent(content, section.name);
    const wordCount = countWords(sectionContent);
    const targetWords = section.wordTarget;
    const minWords = Math.floor(targetWords * (1 - tolerance));
    const maxWords = Math.ceil(targetWords * (1 + tolerance));
    const percentage = (wordCount / targetWords) * 100;
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check if section is present
    const isPresent = sectionContent.length > 0;
    if (!isPresent && section.isRequired) {
      errors.push(`Required section missing: ${section.name}`);
    }
    
    // Check word count if section is present
    if (isPresent) {
      if (wordCount < minWords) {
        errors.push(`Section word count too low: ${wordCount} < ${minWords}`);
      } else if (wordCount > maxWords) {
        warnings.push(`Section word count slightly high: ${wordCount} > ${maxWords}`);
      }
    }
    
    // Calculate score
    let score = 100;
    if (!isPresent) {
      score = section.isRequired ? 0 : 50;
    } else {
      const variance = Math.abs(percentage - 100);
      if (variance > 20) score -= 50;
      else if (variance > 10) score -= 25;
      else if (variance > 5) score -= 10;
    }
    
    return {
      name: section.name,
      wordTarget: targetWords,
      actualWords: wordCount,
      percentage,
      isValid: errors.length === 0,
      isRequired: section.isRequired,
      isPresent,
      errors,
      warnings,
      score: Math.max(0, score)
    };
  });
}

/**
 * Extract section content
 */
function extractSectionContent(content: string, sectionName: string): string {
  const patterns = [
    new RegExp(`<h[1-6][^>]*id="?${sectionName.toLowerCase().replace(/\s+/g, '-')}"?[^>]*>([\\s\\S]*?)(?=<h[1-6]|$)`, 'i'),
    new RegExp(`<section[^>]*id="?${sectionName.toLowerCase().replace(/\s+/g, '-')}"?[^>]*>([\\s\\S]*?)<\\/section>`, 'i'),
    new RegExp(`<h[1-6][^>]*>\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</h[1-6]>([\\s\\S]*?)(?=<h[1-6]|$)`, 'i'),
    new RegExp(`#{1,3}\\s*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=#{1,3}|$)`, 'i'),
    new RegExp(`\\*\\*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*[\\s\\S]*?(?=\\*\\*|\\n\\n|$)`, 'i')
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  return '';
}

/**
 * Validate citations
 */
function validateCitations(content: string): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for citation patterns
  const citationPatterns = [
    /\[\d+\]/g,           // [1], [2], etc.
    /\[SRC-\d+\]/gi,     // [SRC-1], [SRC-2], etc.
    /\([^)]*\d{4}[^)]*\)/g  // (Smith, 2020)
  ];
  
  let hasCitations = false;
  for (const pattern of citationPatterns) {
    if (pattern.test(content)) {
      hasCitations = true;
      break;
    }
  }
  
  if (!hasCitations) {
    errors.push('No citations found in content');
  }
  
  // Check citation consistency
  const numericCitations = content.match(/\[\d+\]/g);
  if (numericCitations) {
    const citationNumbers = numericCitations.map(c => parseInt(c.slice(1, -1)));
    const maxCitation = Math.max(...citationNumbers);
    
    // Check for gaps in citation numbering
    for (let i = 1; i <= maxCitation; i++) {
      if (!citationNumbers.includes(i)) {
        warnings.push(`Citation gap: [${i}] is missing`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate methodology section
 */
function validateMethodology(content: string): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for methodology keywords
  const methodologyKeywords = [
    'methodology', 'method', 'approach', 'procedure', 'process',
    'data collection', 'analysis', 'framework', 'technique'
  ];
  
  const methodologySection = extractSectionContent(content, 'Methodology') ||
                           extractSectionContent(content, 'Method') ||
                           extractSectionContent(content, 'Approach');
  
  if (!methodologySection) {
    errors.push('No methodology section found');
    return { isValid: false, errors, warnings };
  }
  
  const methodologyLower = methodologySection.toLowerCase();
  const hasMethodologyKeywords = methodologyKeywords.some(keyword => 
    methodologyLower.includes(keyword)
  );
  
  if (!hasMethodologyKeywords) {
    warnings.push('Methodology section may lack sufficient detail');
  }
  
  // Check methodology length
  const methodologyWordCount = countWords(methodologySection);
  if (methodologyWordCount < 50) {
    warnings.push('Methodology section seems too short');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Calculate overall validation score
 */
function calculateOverallScore(result: FormatValidationResult): number {
  let score = 100;
  
  // Title validation (20% weight)
  score -= (100 - result.titleValidation.score) * 0.2;
  
  // Word count validation (30% weight)
  const wordScore = result.totalWords >= result.targetWords * 0.9 && 
                   result.totalWords <= result.targetWords * 1.1 ? 100 : 50;
  score -= (100 - wordScore) * 0.3;
  
  // Section validation (40% weight)
  const sectionScores = result.sections.map(s => s.score);
  const avgSectionScore = sectionScores.reduce((sum, score) => sum + score, 0) / sectionScores.length;
  score -= (100 - avgSectionScore) * 0.4;
  
  // Error penalties (10% weight)
  score -= result.errors.length * 10;
  
  return Math.max(0, Math.round(score));
}

/**
 * Generate recommendations based on validation results
 */
function generateRecommendations(result: FormatValidationResult): string[] {
  const recommendations: string[] = [];
  
  // Title recommendations
  if (!result.titleValidation.isValid) {
    recommendations.push('Format title as [Concept]: [Subtitle]');
  }
  
  // Word count recommendations
  if (result.totalWords < result.targetWords * 0.9) {
    const needed = Math.ceil(result.targetWords * 0.9 - result.totalWords);
    recommendations.push(`Add approximately ${needed} words to meet minimum requirements`);
  } else if (result.totalWords > result.targetWords * 1.1) {
    const excess = Math.ceil(result.totalWords - result.targetWords * 1.1);
    recommendations.push(`Remove approximately ${excess} words to meet maximum requirements`);
  }
  
  // Section recommendations
  const missingSections = result.sections.filter(s => s.isRequired && !s.isPresent);
  if (missingSections.length > 0) {
    recommendations.push(`Add required sections: ${missingSections.map(s => s.name).join(', ')}`);
  }
  
  const underfilledSections = result.sections.filter(s => s.isPresent && s.percentage < 80);
  if (underfilledSections.length > 0) {
    recommendations.push(`Expand underfilled sections: ${underfilledSections.map(s => s.name).join(', ')}`);
  }
  
  const overfilledSections = result.sections.filter(s => s.isPresent && s.percentage > 120);
  if (overfilledSections.length > 0) {
    recommendations.push(`Condense overfilled sections: ${overfilledSections.map(s => s.name).join(', ')}`);
  }
  
  // Quality recommendations
  if (result.overallScore < 70) {
    recommendations.push('Review content for overall quality and completeness');
  }
  
  return recommendations;
}

/**
 * Batch validate multiple contents
 */
export async function batchValidateFormat(
  contents: Array<{ id: string; content: string; formatId: number }>,
  options: ValidationOptions = {}
): Promise<Array<{ id: string; validation: FormatValidationResult }>> {
  const results = await Promise.all(
    contents.map(async item => ({
      id: item.id,
      validation: await validateFormat(item.content, item.formatId, options)
    }))
  );
  
  return results;
}

/**
 * Generate validation report
 */
export function generateValidationReport(result: FormatValidationResult): string {
  let report = `# Format Validation Report\n\n`;
  
  report += `## Overall Results\n`;
  report += `- **Format:** ${result.formatName} (${result.tier})\n`;
  report += `- **Compliance:** ${result.compliance}\n`;
  report += `- **Overall Score:** ${result.overallScore}/100\n`;
  report += `- **Status:** ${result.isValid ? '✅ Valid' : '❌ Invalid'}\n\n`;
  
  report += `## Word Count\n`;
  report += `- **Target:** ${result.targetWords} words\n`;
  report += `- **Actual:** ${result.totalWords} words\n`;
  report += `- **Variance:** ${((result.totalWords / result.targetWords - 1) * 100).toFixed(1)}%\n\n`;
  
  report += `## Title Validation\n`;
  report += `- **Original:** ${result.titleValidation.original}\n`;
  report += `- **Formatted:** ${result.titleValidation.formatted}\n`;
  report += `- **Format:** ${result.titleValidation.format}\n`;
  report += `- **Score:** ${result.titleValidation.score}/100\n`;
  if (result.titleValidation.issues.length > 0) {
    report += `- **Issues:** ${result.titleValidation.issues.join(', ')}\n`;
  }
  report += `\n`;
  
  report += `## Section Validation\n`;
  result.sections.forEach(section => {
    const status = section.isValid ? '✅' : '❌';
    report += `- **${section.name}:** ${section.actualWords}/${section.wordTarget} words (${section.percentage.toFixed(1)}%) ${status}\n`;
    if (section.errors.length > 0) {
      section.errors.forEach(error => {
        report += `  - ❌ ${error}\n`;
      });
    }
    if (section.warnings.length > 0) {
      section.warnings.forEach(warning => {
        report += `  - ⚠️ ${warning}\n`;
      });
    }
  });
  report += `\n`;
  
  if (result.errors.length > 0) {
    report += `## Errors\n`;
    result.errors.forEach(error => {
      report += `- ❌ ${error}\n`;
    });
    report += `\n`;
  }
  
  if (result.warnings.length > 0) {
    report += `## Warnings\n`;
    result.warnings.forEach(warning => {
      report += `- ⚠️ ${warning}\n`;
    });
    report += `\n`;
  }
  
  if (result.recommendations.length > 0) {
    report += `## Recommendations\n`;
    result.recommendations.forEach(rec => {
      report += `- 💡 ${rec}\n`;
    });
  }
  
  return report;
}

