/**
 * Title Formatter - LawZero Style Standardization
 * Implements [Concept]: [Subtitle] format for all NomosX publications
 */

export interface TitleFormatOptions {
  format: 'lawzero' | 'standard';
  maxLength?: number;
  enforceConcept?: boolean;
}

/**
 * Format title according to LawZero academic standards
 * Format: [Concept]: [Subtitle]
 */
export function formatTitle(title: string, options: TitleFormatOptions = { format: 'lawzero' }): string {
  const { format, maxLength, enforceConcept } = options;
  
  // Clean and normalize title
  const cleanTitle = title.trim();
  
  if (format === 'lawzero') {
    // Check if title already follows LawZero format
    if (validateTitleFormat(cleanTitle, 'lawzero')) {
      return cleanTitle;
    }
    
    // Try to convert to LawZero format
    const parts = cleanTitle.split(':');
    
    if (parts.length >= 2) {
      // Multiple parts found - format as [Concept]: [Subtitle]
      const concept = parts[0].trim();
      const subtitle = parts.slice(1).join(':').trim();
      
      // Enforce concept format if required
      if (enforceConcept && !concept.match(/^\[.+\]$/)) {
        return `[${concept}]: ${subtitle}`;
      }
      
      return `${concept}: ${subtitle}`;
    } else {
      // Single part - convert to [Concept]: [Subtitle]
      const words = cleanTitle.split(' ');
      
      if (words.length >= 3) {
        // Try to identify concept (first 1-2 words)
        const conceptWords = words.slice(0, Math.min(2, Math.ceil(words.length * 0.3)));
        const subtitleWords = words.slice(conceptWords.length);
        
        const concept = conceptWords.join(' ');
        const subtitle = subtitleWords.join(' ');
        
        if (enforceConcept) {
          return `[${concept}]: ${subtitle}`;
        }
        
        return `${concept}: ${subtitle}`;
      } else {
        // Too short for meaningful split - use as concept
        if (enforceConcept) {
          return `[${cleanTitle}]: Analysis`;
        }
        
        return `${cleanTitle}: Analysis`;
      }
    }
  }
  
  // Apply length limit if specified
  if (maxLength && cleanTitle.length > maxLength) {
    return cleanTitle.substring(0, maxLength - 3) + '...';
  }
  
  return cleanTitle;
}

/**
 * Validate title format compliance
 */
export function validateTitleFormat(title: string, format: 'lawzero' | 'standard' = 'lawzero'): boolean {
  const cleanTitle = title.trim();
  
  if (format === 'lawzero') {
    // LawZero format: [Concept]: [Subtitle] or Concept: Subtitle
    const lawzeroPattern = /^\[.+\]: .+$/;
    const simplePattern = /^[^:]+: .+$/;
    
    return lawzeroPattern.test(cleanTitle) || simplePattern.test(cleanTitle);
  }
  
  // Standard format - just check it's not empty
  return cleanTitle.length > 0;
}

/**
 * Extract concept and subtitle from title
 */
export function parseTitle(title: string): { concept: string; subtitle: string; format: 'lawzero' | 'standard' } {
  const cleanTitle = title.trim();
  
  // Check for LawZero format
  const lawzeroMatch = cleanTitle.match(/^\[(.+?)\]: (.+)$/);
  if (lawzeroMatch) {
    return {
      concept: lawzeroMatch[1],
      subtitle: lawzeroMatch[2],
      format: 'lawzero'
    };
  }
  
  // Check for simple format
  const simpleMatch = cleanTitle.match(/^([^:]+): (.+)$/);
  if (simpleMatch) {
    return {
      concept: simpleMatch[1],
      subtitle: simpleMatch[2],
      format: 'lawzero'
    };
  }
  
  // No format detected
  return {
    concept: cleanTitle,
    subtitle: '',
    format: 'standard'
  };
}

/**
 * Generate title suggestions based on content
 */
export function generateTitleSuggestions(content: string, maxSuggestions: number = 5): string[] {
  const suggestions: string[] = [];
  
  // Extract key concepts from content
  const words = content.toLowerCase().split(/\s+/);
  const conceptCandidates: string[] = [];
  
  // Look for AI/tech terms
  const techTerms = ['ai', 'artificial intelligence', 'machine learning', 'blockchain', 'quantum', 'biotech', 'climate', 'healthcare'];
  for (const term of techTerms) {
    if (words.includes(term)) {
      conceptCandidates.push(term.charAt(0).toUpperCase() + term.slice(1));
    }
  }
  
  // Look for impact/analysis terms
  const impactTerms = ['impact', 'analysis', 'assessment', 'evaluation', 'review', 'study'];
  for (const term of impactTerms) {
    if (words.includes(term)) {
      conceptCandidates.push(term.charAt(0).toUpperCase() + term.slice(1));
    }
  }
  
  // Generate suggestions
  for (let i = 0; i < Math.min(maxSuggestions, conceptCandidates.length); i++) {
    const concept = conceptCandidates[i];
    const subtitle = generateSubtitleFromContent(content, concept);
    suggestions.push(formatTitle(`${concept}: ${subtitle}`, { format: 'lawzero', enforceConcept: true }));
  }
  
  return suggestions;
}

/**
 * Generate subtitle from content based on concept
 */
function generateSubtitleFromContent(content: string, concept: string): string {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Look for sentences containing the concept
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(concept.toLowerCase())) {
      const cleanSentence = sentence.trim();
      if (cleanSentence.length <= 100) {
        return cleanSentence;
      } else {
        return cleanSentence.substring(0, 97) + '...';
      }
    }
  }
  
  // Fallback to first meaningful sentence
  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    if (cleanSentence.length >= 10 && cleanSentence.length <= 100) {
      return cleanSentence;
    }
  }
  
  return 'Comprehensive Analysis and Strategic Implications';
}

/**
 * Batch format titles
 */
export function batchFormatTitles(titles: string[], options: TitleFormatOptions = { format: 'lawzero' }): Array<{
  original: string;
  formatted: string;
  isValid: boolean;
  changed: boolean;
}> {
  return titles.map(title => {
    const formatted = formatTitle(title, options);
    const isValid = validateTitleFormat(formatted, options.format);
    const changed = title !== formatted;
    
    return {
      original: title,
      formatted,
      isValid,
      changed
    };
  });
}

/**
 * Title quality score
 */
export function scoreTitleQuality(title: string): {
  score: number;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  
  const parsed = parseTitle(title);
  
  // Check format
  if (parsed.format === 'standard') {
    issues.push('Title does not follow LawZero format [Concept]: [Subtitle]');
    suggestions.push('Use format: [Concept]: [Subtitle]');
    score -= 30;
  }
  
  // Check length
  if (title.length < 20) {
    issues.push('Title too short');
    suggestions.push('Add more descriptive subtitle');
    score -= 20;
  } else if (title.length > 150) {
    issues.push('Title too long');
    suggestions.push('Consider shortening title');
    score -= 10;
  }
  
  // Check concept quality
  if (parsed.concept.length < 3) {
    issues.push('Concept too short');
    suggestions.push('Use more descriptive concept');
    score -= 15;
  }
  
  // Check subtitle quality
  if (parsed.subtitle.length < 10) {
    issues.push('Subtitle too short');
    suggestions.push('Add more descriptive subtitle');
    score -= 15;
  }
  
  // Check for academic terms
  const academicTerms = ['analysis', 'study', 'research', 'assessment', 'evaluation', 'review'];
  const hasAcademicTerm = academicTerms.some(term => 
    title.toLowerCase().includes(term.toLowerCase())
  );
  
  if (!hasAcademicTerm) {
    issues.push('Missing academic terminology');
    suggestions.push('Include academic terms like "analysis", "study", etc.');
    score -= 10;
  }
  
  return {
    score: Math.max(0, score),
    issues,
    suggestions
  };
}

