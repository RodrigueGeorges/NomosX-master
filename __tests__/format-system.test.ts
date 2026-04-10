/**
 * Format System Tests
 * Comprehensive tests for the NomosX format system
 */

import { describe, test, expect, beforeEach, beforeAll } from '@jest/globals';
import { formatTitle, validateTitleFormat, parseTitle, scoreTitleQuality } from '@/lib/formatters/title-formatter';
import { countWords, validateWordCount, countWordsBySections } from '@/lib/word-counter';
import { validateFormat } from '@/lib/validators/format-validator';
import { generateFormatTemplate, generateContent } from '@/lib/generators/format-generator';

// Mock database for testing
const mockFormats = [
  {
    id: 1,
    name: 'Summary Report',
    tier: 'FREE',
    totalWords: 600,
    lawzeroInspired: true,
    validationRules: JSON.stringify({
      minWords: 550,
      maxWords: 650,
      requiredSections: ['Executive Summary', 'Key Findings', 'Conclusion'],
      titleFormat: '[Concept]: [Subtitle]'
    }),
    sections: [
      { name: 'Executive Summary', wordTarget: 150, percentageTarget: 25.0, isRequired: true, orderIndex: 1 },
      { name: 'Key Findings', wordTarget: 300, percentageTarget: 50.0, isRequired: true, orderIndex: 2 },
      { name: 'Conclusion', wordTarget: 150, percentageTarget: 25.0, isRequired: true, orderIndex: 3 }
    ]
  },
  {
    id: 2,
    name: 'Executive Brief',
    tier: 'PREMIUM',
    totalWords: 2000,
    lawzeroInspired: true,
    validationRules: JSON.stringify({
      minWords: 1900,
      maxWords: 2100,
      requiredSections: ['Executive Summary', 'Context Analysis', 'Key Findings', 'Strategic Implications', 'Recommendations'],
      citationsRequired: true,
      methodologyRequired: true
    }),
    sections: [
      { name: 'Executive Summary', wordTarget: 250, percentageTarget: 12.5, isRequired: true, orderIndex: 1 },
      { name: 'Context Analysis', wordTarget: 400, percentageTarget: 20.0, isRequired: true, orderIndex: 2 },
      { name: 'Key Findings', wordTarget: 500, percentageTarget: 25.0, isRequired: true, orderIndex: 3 },
      { name: 'Strategic Implications', wordTarget: 350, percentageTarget: 17.5, isRequired: true, orderIndex: 4 },
      { name: 'Recommendations', wordTarget: 350, percentageTarget: 17.5, isRequired: true, orderIndex: 5 },
      { name: 'Implementation Considerations', wordTarget: 150, percentageTarget: 7.5, isRequired: false, orderIndex: 6 }
    ]
  }
];

describe('Title Formatter', () => {
  describe('formatTitle', () => {
    test('should format title to LawZero style', () => {
      expect(formatTitle('AI Impact Analysis', { format: 'lawzero' })).toBe('AI Impact Analysis');
      expect(formatTitle('AI: Impact Analysis', { format: 'lawzero' })).toBe('AI: Impact Analysis');
      expect(formatTitle('AI Impact on Healthcare', { format: 'lawzero' })).toBe('AI Impact: on Healthcare');
    });

    test('should enforce concept brackets when required', () => {
      expect(formatTitle('AI: Impact Analysis', { format: 'lawzero', enforceConcept: true })).toBe('[AI]: Impact Analysis');
      expect(formatTitle('AI Impact Analysis', { format: 'lawzero', enforceConcept: true })).toBe('[AI Impact]: Analysis');
    });

    test('should apply length limit', () => {
      const longTitle = 'This is a very long title that exceeds the maximum length limit';
      expect(formatTitle(longTitle, { format: 'lawzero', maxLength: 50 })).toHaveLength(53); // + '...'
    });
  });

  describe('validateTitleFormat', () => {
    test('should validate LawZero format', () => {
      expect(validateTitleFormat('[AI]: Impact Analysis', 'lawzero')).toBe(true);
      expect(validateTitleFormat('AI: Impact Analysis', 'lawzero')).toBe(true);
      expect(validateTitleFormat('AI Impact Analysis', 'lawzero')).toBe(false);
      expect(validateTitleFormat('AI Impact Analysis', 'standard')).toBe(true);
    });
  });

  describe('parseTitle', () => {
    test('should parse LawZero format correctly', () => {
      const parsed = parseTitle('[AI]: Impact Analysis');
      expect(parsed.concept).toBe('AI');
      expect(parsed.subtitle).toBe('Impact Analysis');
      expect(parsed.format).toBe('lawzero');
    });

    test('should parse simple format correctly', () => {
      const parsed = parseTitle('AI: Impact Analysis');
      expect(parsed.concept).toBe('AI');
      expect(parsed.subtitle).toBe('Impact Analysis');
      expect(parsed.format).toBe('lawzero');
    });

    test('should handle standard format', () => {
      const parsed = parseTitle('AI Impact Analysis');
      expect(parsed.concept).toBe('AI Impact Analysis');
      expect(parsed.subtitle).toBe('');
      expect(parsed.format).toBe('standard');
    });
  });

  describe('scoreTitleQuality', () => {
    test('should score high quality titles', () => {
      const score = scoreTitleQuality('[AI]: Impact Analysis and Strategic Assessment');
      expect(score.score).toBeGreaterThan(80);
      expect(score.issues).toHaveLength(0);
    });

    test('should identify title issues', () => {
      const score = scoreTitleQuality('AI');
      expect(score.score).toBeLessThan(70);
      expect(score.issues.length).toBeGreaterThan(0);
      expect(score.suggestions.length).toBeGreaterThan(0);
    });
  });
});

describe('Word Counter', () => {
  describe('countWords', () => {
    test('should count words correctly', () => {
      expect(countWords('Hello world')).toBe(2);
      expect(countWords('This is a test sentence')).toBe(5);
      expect(countWords('  Multiple   spaces  between  words  ')).toBe(5);
    });

    test('should handle HTML content', () => {
      expect(countWords('<p>Hello <strong>world</strong></p>')).toBe(2);
      expect(countWords('<h1>Title</h1><p>Content here</p>')).toBe(3);
    });

    test('should handle hyphenated words', () => {
      expect(countWords('state-of-the-art technology', { includeHyphenated: true })).toBe(3);
      expect(countWords('state-of-the-art technology', { includeHyphenated: false })).toBe(4);
    });

    test('should filter by length', () => {
      expect(countWords('A B C D E F G', { minLength: 2 })).toBe(2); // 'A' and 'B' filtered out
      expect(countWords('A B C D E F G', { maxLength: 1 })).toBe(7);
    });
  });

  describe('validateWordCount', () => {
    test('should validate within tolerance', () => {
      const result = validateWordCount('This is a test with exactly ten words', 10, 0.1);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject outside tolerance', () => {
      const result = validateWordCount('Short', 10, 0.1);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should warn for slightly high counts', () => {
      const result = validateWordCount('This has exactly eleven words here', 10, 0.1);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('countWordsBySections', () => {
    test('should count words by sections', () => {
      const content = `
        <h2>Executive Summary</h2>
        <p>This is the executive summary with exactly ten words.</p>
        <h2>Key Findings</h2>
        <p>These are the key findings with exactly five words.</p>
      `;
      
      const sections = [
        { name: 'Executive Summary', targetWords: 10 },
        { name: 'Key Findings', targetWords: 5 }
      ];
      
      const results = countWordsBySections(content, sections);
      
      expect(results).toHaveLength(2);
      expect(results[0].wordCount).toBe(10);
      expect(results[1].wordCount).toBe(5);
    });
  });
});

describe('Format Validator', () => {
  beforeEach(() => {
    // Mock prisma calls
    jest.mock('@/lib/db', () => ({
      prisma: {
        publicationFormat: {
          findUnique: jest.fn()
        }
      }
    }));
  });

  describe('validateFormat', () => {
    test('should validate compliant content', async () => {
      const content = `
        <h1>[AI]: Healthcare Impact Analysis</h1>
        <h2>Executive Summary</h2>
        <p>This executive summary contains exactly one hundred fifty words to meet the target requirements for this section. It provides a comprehensive overview of the key findings and strategic implications that will be discussed in detail throughout this analysis. The summary serves as a roadmap for readers, highlighting the most critical insights and recommendations that emerge from our extensive research and analysis of the healthcare AI landscape.</p>
        <h2>Key Findings</h2>
        <p>Our analysis reveals several key findings about AI in healthcare. First, diagnostic accuracy improvements of 15-20% are consistently reported across multiple studies. Second, implementation challenges remain significant, with integration costs averaging $2.5M per hospital. Third, regulatory approval processes are becoming more streamlined, reducing time-to-market by approximately 30%. Fourth, patient acceptance rates are surprisingly high at 78%, indicating strong market readiness. Finally, ROI projections show break-even within 18-24 months for most implementations.</p>
        <h2>Conclusion</h2>
        <p>The conclusion summarizes our findings and provides actionable next steps. Healthcare organizations should begin AI implementation planning immediately, focusing on diagnostic applications first. Investment priorities should include staff training and technology infrastructure. Success requires careful change management and ongoing monitoring of outcomes.</p>
      `;

      // Mock the format lookup
      const { prisma } = require('@/lib/db');
      prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

      const validation = await validateFormat(content, 1);
      
      expect(validation.isValid).toBe(true);
      expect(validation.formatName).toBe('Summary Report');
      expect(validation.compliance).toBe('FULL');
      expect(validation.overallScore).toBeGreaterThan(80);
    });

    test('should identify missing sections', async () => {
      const content = `
        <h1>[AI]: Healthcare Impact Analysis</h1>
        <h2>Executive Summary</h2>
        <p>This executive summary contains exactly one hundred fifty words to meet the target requirements for this section. It provides a comprehensive overview of the key findings and strategic implications that will be discussed in detail throughout this analysis.</p>
        <!-- Missing Key Findings and Conclusion sections -->
      `;

      // Mock the format lookup
      const { prisma } = require('@/lib/db');
      prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

      const validation = await validateFormat(content, 1);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.compliance).toBe('FAILED');
    });

    test('should validate title format', async () => {
      const content = `
        <h1>AI Impact Analysis</h1>
        <h2>Executive Summary</h2>
        <p>This executive summary contains exactly one hundred fifty words to meet the target requirements for this section. It provides a comprehensive overview of the key findings and strategic implications that will be discussed in detail throughout this analysis.</p>
        <h2>Key Findings</h2>
        <p>Our analysis reveals several key findings about AI in healthcare. First, diagnostic accuracy improvements are significant. Second, implementation challenges remain substantial. Third, regulatory processes are improving.</p>
        <h2>Conclusion</h2>
        <p>The conclusion summarizes our findings and provides actionable next steps for healthcare organizations considering AI implementation.</p>
      `;

      // Mock the format lookup
      const { prisma } = require('@/lib/db');
      prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

      const validation = await validateFormat(content, 1);
      
      expect(validation.titleValidation.isValid).toBe(false);
      expect(validation.titleValidation.issues.length).toBeGreaterThan(0);
    });
  });
});

describe('Format Generator', () => {
  beforeEach(() => {
    // Mock prisma calls
    jest.mock('@/lib/db', () => ({
      prisma: {
        publicationFormat: {
          findUnique: jest.fn()
        }
      }
    }));
  });

  describe('generateFormatTemplate', () => {
    test('should generate template for format', async () => {
      // Mock the format lookup
      const { prisma } = require('@/lib/db');
      prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

      const template = await generateFormatTemplate(1);
      
      expect(template.id).toBe(1);
      expect(template.name).toBe('Summary Report');
      expect(template.tier).toBe('FREE');
      expect(template.totalWords).toBe(600);
      expect(template.sections).toHaveLength(3);
      expect(template.template).toContain('Summary Report Template');
      expect(template.htmlTemplate).toContain('<!DOCTYPE html>');
    });
  });

  describe('generateContent', () => {
    test('should generate content based on format and topic', async () => {
      // Mock the format lookup
      const { prisma } = require('@/lib/db');
      prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

      const content = await generateContent(1, 'AI in Healthcare');
      
      expect(content.title).toMatch(/\[.+\]: .+/); // LawZero format
      expect(content.content).toContain('# ');
      expect(content.html).toContain('<h1>');
      expect(content.metadata.formatName).toBe('Summary Report');
      expect(content.metadata.tier).toBe('FREE');
      expect(content.metadata.wordCount).toBeGreaterThan(0);
      expect(content.metadata.sections).toHaveLength(3);
    });

    test('should use custom title when provided', async () => {
      // Mock the format lookup
      const { prisma } = require('@/lib/db');
      prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

      const content = await generateContent(1, 'AI in Healthcare', {
        title: '[Machine Learning]: Healthcare Transformation'
      });
      
      expect(content.title).toBe('[Machine Learning]: Healthcare Transformation');
    });
  });
});

describe('Integration Tests', () => {
  test('should handle complete format workflow', async () => {
    // Mock the format lookup
    const { prisma } = require('@/lib/db');
    prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

    // 1. Generate content
    const generated = await generateContent(1, 'AI in Healthcare');
    
    // 2. Validate generated content
    const validation = await validateFormat(generated.content, 1);
    
    // 3. Check that generated content meets format requirements
    expect(validation.isValid).toBe(true);
    expect(validation.compliance).toBe('FULL');
    expect(validation.overallScore).toBeGreaterThan(70);
    
    // 4. Check title formatting
    expect(validateTitleFormat(generated.title, 'lawzero')).toBe(true);
    
    // 5. Check word count
    const wordValidation = validateWordCount(generated.content, 600, 0.1);
    expect(wordValidation.isValid).toBe(true);
  });

  test('should handle batch validation', async () => {
    // Mock the format lookup
    const { prisma } = require('@/lib/db');
    prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

    const contents = [
      {
        id: 'content1',
        content: '<h1>[AI]: Analysis</h1><h2>Executive Summary</h2><p>Valid content with proper structure and word count meeting all requirements for the summary report format.</p><h2>Key Findings</h2><p>Key findings with sufficient detail and analysis.</p><h2>Conclusion</h2><p>Proper conclusion with actionable insights.</p>',
        formatId: 1
      },
      {
        id: 'content2',
        content: '<h1>Invalid Title</h1><p>Missing sections and insufficient content.</p>',
        formatId: 1
      }
    ];

    const { batchValidateFormat } = require('@/lib/validators/format-validator');
    const results = await batchValidateFormat(contents);
    
    expect(results).toHaveLength(2);
    expect(results[0].validation.isValid).toBe(true);
    expect(results[1].validation.isValid).toBe(false);
  });
});

describe('Error Handling', () => {
  test('should handle format not found', async () => {
    // Mock the format lookup to return null
    const { prisma } = require('@/lib/db');
    prisma.publicationFormat.findUnique.mockResolvedValue(null);

    await expect(validateFormat('content', 999)).rejects.toThrow('Format not found: 999');
  });

  test('should handle invalid content gracefully', async () => {
    // Mock the format lookup
    const { prisma } = require('@/lib/db');
    prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

    const validation = await validateFormat('', 1);
    
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });
});

describe('Performance Tests', () => {
  test('should handle large content efficiently', async () => {
    // Generate large content (5000 words)
    const largeContent = 'Word '.repeat(5000);
    
    const startTime = Date.now();
    const wordCount = countWords(largeContent);
    const endTime = Date.now();
    
    expect(wordCount).toBe(5000);
    expect(endTime - startTime).toBeLessThan(100); // Should complete in < 100ms
  });

  test('should handle multiple validations efficiently', async () => {
    // Mock the format lookup
    const { prisma } = require('@/lib/db');
    prisma.publicationFormat.findUnique.mockResolvedValue(mockFormats[0]);

    const contents = Array(10).fill(null).map((_, i) => ({
      id: `content${i}`,
      content: `<h1>[Test]: Analysis ${i}</h1><h2>Executive Summary</h2><p>Test content ${i} with sufficient words to meet requirements.</p><h2>Key Findings</h2><p>Key findings for test ${i}.</p><h2>Conclusion</h2><p>Conclusion for test ${i}.</p>`,
      formatId: 1
    }));

    const { batchValidateFormat } = require('@/lib/validators/format-validator');
    const startTime = Date.now();
    const results = await batchValidateFormat(contents);
    const endTime = Date.now();
    
    expect(results).toHaveLength(10);
    expect(endTime - startTime).toBeLessThan(1000); // Should complete in < 1 second
  });
});

// Run tests
if (require.main === module) {
  // This would be handled by Jest test runner
}
