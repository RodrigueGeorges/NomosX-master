/**
 * Format System Tests
 * Comprehensive tests for the NomosX format system
 */

import { describe, test, expect, beforeEach, beforeAll } from '@jest/globals';
import { formatTitle, validateTitleFormat, parseTitle, scoreTitleQuality } from '@/lib/formatters/title-formatter';
import { countWords, validateWordCount, countWordsBySections } from '@/lib/word-counter';
import { validateFormat } from '@/lib/validators/format-validator';
import { generateFormatTemplate, generateContent } from '@/lib/generators/format-generator';

// Module-level mock — Jest hoists this above all imports
jest.mock('@/lib/db', () => ({
  prisma: {
    publicationFormat: {
      findUnique: jest.fn()
    }
  }
}));

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
      expect(countWords('  Multiple   spaces  between  words  ')).toBe(4);
    });

    test('should handle HTML content', () => {
      expect(countWords('<p>Hello <strong>world</strong></p>')).toBe(2);
      expect(countWords('<h1>Title</h1><p>Content here</p>')).toBe(3);
    });

    test('should handle hyphenated words', () => {
      // includeHyphenated: true → hyphenated words count as 1 word each
      expect(countWords('state-of-the-art technology', { includeHyphenated: true })).toBe(2);
      // includeHyphenated: false → hyphens replaced with spaces, each part counted
      expect(countWords('state-of-the-art technology', { includeHyphenated: false })).toBe(5);
    });

    test('should filter by length', () => {
      // minLength: 2 filters out single-char words, leaving 'AB' and 'CD'
      expect(countWords('AB CD E F G', { minLength: 2 })).toBe(2);
      // maxLength: 1 keeps only single-char words
      expect(countWords('A B C D E F G', { maxLength: 1 })).toBe(7);
    });
  });

  describe('validateWordCount', () => {
    test('should validate within tolerance', () => {
      const result = validateWordCount('This is a test with exactly ten written words', 10, 0.1);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject outside tolerance', () => {
      const result = validateWordCount('Short', 10, 0.1);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should warn for slightly high counts', () => {
      const result = validateWordCount('This test content has exactly eleven total words written in it here', 10, 0.1);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('countWordsBySections', () => {
    test('should count words by sections', () => {
      const content = `
        <h2>Executive Summary</h2>
        <p>This executive summary contains exactly ten words for testing here.</p>
        <h2>Key Findings</h2>
        <p>These are five key words.</p>
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
    const { prisma } = require('@/lib/db');
    (prisma.publicationFormat.findUnique as jest.Mock).mockReset();
  });

  describe('validateFormat', () => {
    test('should validate compliant content', async () => {
      const content = `
        <h1>[AI]: Healthcare Impact Analysis</h1>
        <h2>Executive Summary</h2>
        <p>This executive summary provides a comprehensive overview of the key findings and strategic implications that will be discussed in detail throughout this analysis. The summary serves as a roadmap for readers, highlighting the most critical insights and recommendations that emerge from our extensive research and analysis of the healthcare AI landscape. Our findings indicate significant potential for AI to transform healthcare delivery, particularly in diagnostic accuracy, operational efficiency, and patient engagement. Stakeholders must act decisively to capture value in this rapidly evolving landscape. The research presented here synthesizes data from multiple sources including peer-reviewed studies, industry reports, and expert interviews. Key themes include the tension between rapid innovation and regulatory compliance, the need for workforce transformation, and the importance of ethical AI frameworks. This report provides decision-makers with actionable insights to navigate the complex healthcare AI ecosystem.</p>
        <h2>Key Findings</h2>
        <p>Our analysis reveals several key findings about AI in healthcare. First, diagnostic accuracy improvements of fifteen to twenty percent are consistently reported across multiple studies, with radiology and pathology showing the most significant gains. Second, implementation challenges remain significant, with integration costs averaging two point five million dollars per hospital, though these costs are decreasing as platforms mature and vendor competition increases. Third, regulatory approval processes are becoming more streamlined, reducing time-to-market by approximately thirty percent compared to historical baselines, particularly in the United States and European Union. Fourth, patient acceptance rates are surprisingly high at seventy-eight percent, indicating strong market readiness and willingness to adopt AI-enabled care models when properly communicated and deployed. Fifth, workflow integration remains the primary barrier to adoption, with sixty-five percent of implementations experiencing delays due to interoperability issues with existing electronic health record systems. Sixth, training and change management requirements are substantial, requiring an average of forty hours of staff training per implementation, with specialized roles needing up to eighty hours. Seventh, post-implementation monitoring reveals sustained performance improvements, with diagnostic accuracy gains maintained or improved over twenty-four month follow-up periods, suggesting durable rather than transient benefits. Eighth, cost-benefit analyses demonstrate that institutions investing in comprehensive implementation strategies achieve significantly better outcomes than those taking minimal approaches. Ninth, ethical considerations including bias mitigation, transparency, and accountability must be embedded throughout the AI lifecycle. Tenth, data quality and governance frameworks are critical success factors, with organizations maintaining robust data pipelines achieving forty percent better outcomes. Finally, ROI projections show break-even within eighteen to twenty-four months for most implementations, with larger institutions achieving faster returns due to economies of scale and existing technology infrastructure.</p>
        <h2>Conclusion</h2>
        <p>The conclusion summarizes our findings and provides actionable next steps for healthcare organizations considering strategic AI adoption. Healthcare organizations should begin AI implementation planning immediately, focusing on diagnostic applications first where ROI is strongest and regulatory pathways are clearest. Investment priorities should include staff training, technology infrastructure upgrades, interoperability solutions, and data governance frameworks. Success requires careful change management, executive sponsorship, and ongoing monitoring of outcomes. Organizations that act decisively will be well-positioned to capture value in this evolving landscape while improving patient care quality and operational efficiency. The evidence strongly supports strategic investment in AI capabilities as a competitive necessity rather than an optional enhancement. Future research should monitor emerging applications in treatment planning, drug discovery, and personalized medicine, which show promising early results. Healthcare leaders must balance innovation enthusiasm with pragmatic implementation approaches.</p>
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
    const { prisma } = require('@/lib/db');
    (prisma.publicationFormat.findUnique as jest.Mock).mockReset();
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
    expect(validation.compliance).not.toBe('FAILED');
    expect(validation.overallScore).toBeGreaterThan(50);
    
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
        content: '<h1>[AI]: Analysis</h1><h2>Executive Summary</h2><p>This executive summary provides a comprehensive overview of the analysis and key findings. The research indicates significant trends and strategic implications for stakeholders. The summary serves as a roadmap highlighting critical insights and recommendations from our extensive analysis of the current landscape and future projections. Our findings suggest that organizations must adapt rapidly to changing conditions. The analysis covers market dynamics, regulatory environment, technological disruption, and competitive positioning. Stakeholders should use this report to inform strategic planning and resource allocation decisions in the coming quarters. The comprehensive research methodology included quantitative analysis of market data, qualitative interviews with industry experts, and comparative benchmarking against leading organizations. Key themes identified include the acceleration of digital transformation initiatives, shifting customer expectations, and the growing importance of sustainability considerations in strategic planning.</p><h2>Key Findings</h2><p>Our analysis reveals several critical insights. First, market dynamics show significant growth potential with projected annual increases of fifteen to twenty percent across key segments, driven by emerging technologies and changing consumer preferences. Second, regulatory changes create both challenges and opportunities for industry participants, with new compliance requirements emerging around data privacy, environmental standards, and industry-specific certifications. Third, technological advancements disrupt traditional models requiring strategic adaptation and investment in new capabilities including artificial intelligence, cloud infrastructure, and automation platforms. Fourth, consumer behavior shifts indicate changing preferences that organizations must address through product and service evolution, with digital-first experiences becoming the baseline expectation. Fifth, competitive analysis reveals emerging threats and partnership opportunities that could reshape industry structure, with consolidation activity accelerating among mid-tier players. Sixth, financial performance metrics indicate varying profitability across segments, with premium offerings showing strongest margins and value segments demonstrating volume growth. Seventh, operational capabilities vary significantly across organizations, with leaders leveraging technology and process excellence to achieve superior efficiency and customer satisfaction. Eighth, risk profiles differ requiring tailored mitigation strategies addressing specific organizational vulnerabilities including supply chain dependencies, technology obsolescence, and talent retention. Ninth, talent acquisition and retention challenges persist across the industry, with specialized skills in data science, cybersecurity, and digital transformation in particularly high demand. Tenth, sustainability and environmental considerations increasingly influence stakeholder decisions, with investors, customers, and regulators all demanding greater transparency and action. Finally, investment in digital transformation capabilities correlates strongly with improved performance outcomes, with leading organizations achieving twenty to thirty percent efficiency gains.</p><h2>Conclusion</h2><p>The analysis demonstrates significant opportunities for strategic action. Key recommendations include immediate market assessment, strategic roadmap development, and resource allocation for technology initiatives. Success requires careful execution, strong leadership, and ongoing monitoring of outcomes. Organizations that act decisively will capture value in this evolving landscape. The evidence supports prioritizing investments in digital capabilities, talent development, and operational excellence. Future analysis should monitor emerging trends and adjust strategies accordingly. Organizations should establish dedicated transformation offices to coordinate cross-functional initiatives and ensure accountability. Regular performance reviews and milestone tracking will be essential for maintaining momentum and demonstrating progress to stakeholders.</p>',
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
