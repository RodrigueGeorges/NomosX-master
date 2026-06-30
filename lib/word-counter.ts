/**
 * Word Counter and Validation System
 * Accurate word counting with format-specific validation
 */

export interface WordCountOptions {
  includeNumbers?: boolean;
  includeHyphenated?: boolean;
  minLength?: number;
  maxLength?: number;
}

export interface ValidationResult {
  isValid: boolean;
  wordCount: number;
  targetWords: number;
  minWords: number;
  maxWords: number;
  errors: string[];
  warnings: string[];
  score: number;
}

export interface SectionWordCount {
  section: string;
  wordCount: number;
  targetWords: number;
  percentage: number;
  isValid: boolean;
  variance: number;
}

/**
 * Count words in text with various options
 */
export function countWords(text: string, options: WordCountOptions = {}): number {
  const {
    includeNumbers = true,
    includeHyphenated = true,
    minLength = 1,
    maxLength = 100
  } = options;
  
  // Clean and normalize text
  let cleanText = text.trim();
  
  // Remove HTML tags
  cleanText = cleanText.replace(/<[^>]*>/g, ' ');
  
  // Handle hyphenated words
  if (!includeHyphenated) {
    cleanText = cleanText.replace(/-/g, ' ');
  }
  
  // Split into words
  let words = cleanText.split(/\s+/);
  
  // Filter words based on criteria
  words = words.filter(word => {
    const trimmed = word.trim();
    
    // Skip empty strings
    if (trimmed.length === 0) return false;
    
    // Check length constraints
    if (trimmed.length < minLength || trimmed.length > maxLength) return false;
    
    // Check if it's a word (contains at least one letter)
    const hasLetter = /[a-zA-Z]/.test(trimmed);
    const isNumber = /^\d+$/.test(trimmed);
    
    if (!includeNumbers && isNumber) return false;
    
    return hasLetter || (includeNumbers && isNumber);
  });
  
  return words.length;
}

/**
 * Validate word count against target with tolerance
 */
export function validateWordCount(
  content: string, 
  target: number, 
  tolerance: number = 0.1
): ValidationResult {
  const wordCount = countWords(content);
  const minWords = Math.floor(target * (1 - tolerance));
  const maxWords = Math.ceil(target * (1 + tolerance));
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check word count validity
  if (wordCount < minWords) {
    errors.push(`Word count too low: ${wordCount} < ${minWords}`);
  } else if (wordCount > maxWords) {
    warnings.push(`Word count slightly high: ${wordCount} > ${maxWords}`);
  }
  
  // Calculate score based on accuracy
  let score = 100;
  const variance = Math.abs(wordCount - target) / target;
  
  if (variance > 0.2) {
    score -= 50;
  } else if (variance > 0.1) {
    score -= 25;
  } else if (variance > 0.05) {
    score -= 10;
  }
  
  // Additional quality checks
  if (wordCount < 50) {
    warnings.push('Very short content - consider adding more detail');
  }
  
  if (wordCount > 10000) {
    warnings.push('Very long content - consider splitting into sections');
  }
  
  return {
    isValid: errors.length === 0,
    wordCount,
    targetWords: target,
    minWords,
    maxWords,
    errors,
    warnings,
    score: Math.max(0, score)
  };
}

/**
 * Count words by section (for structured content)
 */
export function countWordsBySections(
  content: string, 
  sections: Array<{ name: string; targetWords: number }>
): SectionWordCount[] {
  const results: SectionWordCount[] = [];
  
  for (const section of sections) {
    // Extract section content
    const sectionContent = extractSectionContent(content, section.name);
    const wordCount = countWords(sectionContent);
    const percentage = (wordCount / section.targetWords) * 100;
    const variance = Math.abs(percentage - 100);
    const isValid = variance <= 20; // 20% tolerance
    
    results.push({
      section: section.name,
      wordCount,
      targetWords: section.targetWords,
      percentage,
      isValid,
      variance
    });
  }
  
  return results;
}

/**
 * Extract content from a specific section
 */
function extractSectionContent(content: string, sectionName: string): string {
  // Try different section patterns
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
 * Generate word count report
 */
export function generateWordCountReport(
  content: string,
  targetWords: number,
  sections?: Array<{ name: string; targetWords: number }>
): string {
  const validation = validateWordCount(content, targetWords);
  let report = `# Word Count Report\n\n`;
  
  report += `## Overall Validation\n`;
  report += `- **Target Words:** ${targetWords}\n`;
  report += `- **Actual Words:** ${validation.wordCount}\n`;
  report += `- **Valid Range:** ${validation.minWords} - ${validation.maxWords}\n`;
  report += `- **Status:** ${validation.isValid ? '✅ Valid' : '❌ Invalid'}\n`;
  report += `- **Score:** ${validation.score}/100\n\n`;
  
  if (validation.errors.length > 0) {
    report += `## Errors\n`;
    validation.errors.forEach(error => {
      report += `- ❌ ${error}\n`;
    });
    report += `\n`;
  }
  
  if (validation.warnings.length > 0) {
    report += `## Warnings\n`;
    validation.warnings.forEach(warning => {
      report += `- ⚠️ ${warning}\n`;
    });
    report += `\n`;
  }
  
  if (sections) {
    const sectionCounts = countWordsBySections(content, sections);
    report += `## Section Breakdown\n`;
    
    sectionCounts.forEach(section => {
      const status = section.isValid ? '✅' : '❌';
      report += `- **${section.section}:** ${section.wordCount}/${section.targetWords} words (${section.percentage.toFixed(1)}%) ${status}\n`;
    });
    report += `\n`;
  }
  
  // Recommendations
  report += `## Recommendations\n`;
  
  if (validation.wordCount < validation.minWords) {
    const needed = validation.minWords - validation.wordCount;
    report += `- Add approximately ${needed} words to meet minimum requirements\n`;
  } else if (validation.wordCount > validation.maxWords) {
    const excess = validation.wordCount - validation.maxWords;
    report += `- Remove approximately ${excess} words to meet maximum requirements\n`;
  } else {
    report += `- Word count is within acceptable range\n`;
  }
  
  if (sections) {
    const invalidSections = sections ? countWordsBySections(content, sections).filter(s => !s.isValid) : [];
    if (invalidSections.length > 0) {
      report += `- Adjust word distribution in sections: ${invalidSections.map(s => s.section).join(', ')}\n`;
    }
  }
  
  return report;
}

/**
 * Batch word count validation
 */
export function batchValidateWordCount(
  contents: Array<{ id: string; content: string; targetWords: number }>,
  tolerance: number = 0.1
): Array<{ id: string; validation: ValidationResult }> {
  return contents.map(item => ({
    id: item.id,
    validation: validateWordCount(item.content, item.targetWords, tolerance)
  }));
}

/**
 * Estimate reading time
 */
export function estimateReadingTime(wordCount: number, wordsPerMinute: number = 200): {
  minutes: number;
  seconds: number;
  formatted: string;
} {
  const totalSeconds = Math.ceil((wordCount / wordsPerMinute) * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  let formatted = '';
  if (minutes > 0) {
    formatted += `${minutes} min`;
  }
  if (seconds > 0) {
    if (formatted) formatted += ' ';
    formatted += `${seconds} sec`;
  }
  
  return {
    minutes,
    seconds,
    formatted: formatted || '< 1 min'
  };
}

/**
 * Word count statistics
 */
export function getWordCountStats(contents: string[]): {
  totalWords: number;
  averageWords: number;
  minWords: number;
  maxWords: number;
  medianWords: number;
  standardDeviation: number;
} {
  const wordCounts = contents.map(content => countWords(content));
  
  const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
  const averageWords = totalWords / wordCounts.length;
  const minWords = Math.min(...wordCounts);
  const maxWords = Math.max(...wordCounts);
  
  // Calculate median
  const sorted = [...wordCounts].sort((a, b) => a - b);
  const medianWords = sorted[Math.floor(sorted.length / 2)];
  
  // Calculate standard deviation
  const variance = wordCounts.reduce((sum, count) => {
    return sum + Math.pow(count - averageWords, 2);
  }, 0) / wordCounts.length;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    totalWords,
    averageWords,
    minWords,
    maxWords,
    medianWords,
    standardDeviation
  };
}

/**
 * Format word count for display
 */
export function formatWordCount(wordCount: number): string {
  if (wordCount >= 1000000) {
    return `${(wordCount / 1000000).toFixed(1)}M words`;
  } else if (wordCount >= 1000) {
    return `${(wordCount / 1000).toFixed(1)}K words`;
  } else {
    return `${wordCount} words`;
  }
}

