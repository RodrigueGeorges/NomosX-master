/**
 * Format Generator - Generate templates and content for NomosX formats
 * Creates structured templates based on format specifications
 */

import { prisma } from '@/lib/db';
import { formatTitle, generateTitleSuggestions } from '@/lib/formatters/title-formatter';
import { countWords, estimateReadingTime } from '@/lib/word-counter';

export interface FormatTemplate {
  id: number;
  name: string;
  tier: string;
  totalWords: number;
  sections: SectionTemplate[];
  template: string;
  htmlTemplate: string;
  validationRules: ValidationRules;
}

export interface SectionTemplate {
  name: string;
  wordTarget: number;
  percentage: number;
  content: string;
  required: boolean;
  orderIndex: number;
  placeholder: string;
}

export interface ValidationRules {
  minWords: number;
  maxWords: number;
  requiredSections: string[];
  titleFormat: string;
  citationsRequired?: boolean;
  methodologyRequired?: boolean;
  riskAssessmentRequired?: boolean;
  roiAnalysisRequired?: boolean;
}

export interface GeneratedContent {
  title: string;
  content: string;
  html: string;
  metadata: ContentMetadata;
}

export interface ContentMetadata {
  formatId: number;
  formatName: string;
  tier: string;
  wordCount: number;
  readingTime: string;
  sections: SectionMetadata[];
  compliance: 'FULL' | 'PARTIAL' | 'FAILED';
  score: number;
}

export interface SectionMetadata {
  name: string;
  wordCount: number;
  targetWords: number;
  percentage: number;
  isPresent: boolean;
}

/**
 * Generate format template by ID
 */
export async function generateFormatTemplate(formatId: number): Promise<FormatTemplate> {
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
  
  const sections: SectionTemplate[] = format.sections.map((section: any) => ({
    name: section.name,
    wordTarget: section.wordTarget,
    percentage: section.percentageTarget,
    content: section.contentDescription || '',
    required: section.isRequired,
    orderIndex: section.orderIndex,
    placeholder: generateSectionPlaceholder(section.name, section.wordTarget, section.contentDescription || '')
  }));
  
  const validationRules = parseValidationRules(format.validationRules as string);
  
  const template = generateMarkdownTemplate(format.name, sections);
  const htmlTemplate = generateHTMLTemplate(format.name, sections);
  
  return {
    id: format.id,
    name: format.name,
    tier: format.tier,
    totalWords: format.totalWords,
    sections,
    template,
    htmlTemplate,
    validationRules
  };
}

/**
 * Generate all format templates
 */
export async function generateAllFormatTemplates(): Promise<FormatTemplate[]> {
  const formats = await (prisma as any).publicationFormat?.findMany({
    include: { 
      sections: { 
        orderBy: { orderIndex: 'asc' } 
      } 
    },
    orderBy: { tier: 'asc' }
  }) ?? [];
  
  const templates: FormatTemplate[] = [];
  
  for (const format of formats) {
    const template = await generateFormatTemplate(format.id);
    templates.push(template);
  }
  
  return templates;
}

/**
 * Generate content based on format and topic
 */
export async function generateContent(
  formatId: number,
  topic: string,
  options: {
    title?: string;
    researchData?: any;
    citations?: string[];
    methodology?: string;
  } = {}
): Promise<GeneratedContent> {
  const formatTemplate = await generateFormatTemplate(formatId);
  
  // Generate or format title
  const title = options.title || generateTitleFromTopic(topic);
  const formattedTitle = formatTitle(title, { format: 'lawzero' });
  
  // Generate content sections
  const sections: string[] = [];
  const sectionMetadata: SectionMetadata[] = [];
  
  for (const section of formatTemplate.sections) {
    const sectionContent = generateSectionContent(
      section.name,
      topic,
      section.wordTarget,
      options
    );
    
    sections.push(sectionContent);
    
    sectionMetadata.push({
      name: section.name,
      wordCount: countWords(sectionContent),
      targetWords: section.wordTarget,
      percentage: (countWords(sectionContent) / section.wordTarget) * 100,
      isPresent: sectionContent.length > 0
    });
  }
  
  // Combine sections into full content
  const content = combineSections(formattedTitle, sections, formatTemplate.sections);
  const html = convertToHTML(content);
  
  // Calculate metadata
  const totalWordCount = countWords(content);
  const readingTime = estimateReadingTime(totalWordCount);
  
  // Calculate compliance and score
  const compliance = calculateCompliance(sectionMetadata, formatTemplate.validationRules);
  const score = calculateContentScore(sectionMetadata, totalWordCount, formatTemplate.totalWords);
  
  return {
    title: formattedTitle,
    content,
    html,
    metadata: {
      formatId,
      formatName: formatTemplate.name,
      tier: formatTemplate.tier,
      wordCount: totalWordCount,
      readingTime: readingTime.formatted,
      sections: sectionMetadata,
      compliance,
      score
    }
  };
}

/**
 * Generate section placeholder
 */
function generateSectionPlaceholder(sectionName: string, wordTarget: number, description: string): string {
  const placeholders = {
    'Executive Summary': `This section provides a comprehensive overview of the key findings and strategic implications. Target: ${wordTarget} words. Focus on: ${description}`,
    'Key Findings': `Present 3-5 key findings with supporting data and evidence. Target: ${wordTarget} words. Include: ${description}`,
    'Conclusion': `Summarize the main points and provide actionable next steps. Target: ${wordTarget} words. Cover: ${description}`,
    'Context Analysis': `Analyze the current market, regulatory, and competitive landscape. Target: ${wordTarget} words. Include: ${description}`,
    'Strategic Implications': `Discuss the strategic impact on the organization. Target: ${wordTarget} words. Focus on: ${description}`,
    'Recommendations': `Provide actionable recommendations with timeline. Target: ${wordTarget} words. Include: ${description}`,
    'Implementation Considerations': `Outline key success factors and implementation risks. Target: ${wordTarget} words. Cover: ${description}`,
    'Strategic Context': `Analyze macro-economic, regulatory, and technological context. Target: ${wordTarget} words. Include: ${description}`,
    'Comprehensive Analysis': `Provide in-depth multi-dimensional analysis. Target: ${wordTarget} words. Cover: ${description}`,
    'Risk Assessment': `Evaluate risks with quantification and mitigation strategies. Target: ${wordTarget} words. Include: ${description}`,
    'Implementation Roadmap': `Detail 12-24 month implementation plan. Target: ${wordTarget} words. Include: ${description}`,
    'Strategic Recommendations': `Provide detailed strategic recommendations. Target: ${wordTarget} words. Cover: ${description}`,
    'ROI Analysis': `Analyze return on investment with projections. Target: ${wordTarget} words. Include: ${description}`,
    'Monitoring Framework': `Define KPIs and monitoring cadence. Target: ${wordTarget} words. Include: ${description}`
  };
  
  return (placeholders as Record<string, string>)[sectionName] || `Content for ${sectionName}. Target: ${wordTarget} words. Include: ${description}`;
}

/**
 * Generate markdown template
 */
function generateMarkdownTemplate(formatName: string, sections: SectionTemplate[]): string {
  let template = `# ${formatName} Template\n\n`;
  template += `## Structure Overview\n\n`;
  
  sections.forEach((section, index) => {
    const required = section.required ? '[REQUIRED]' : '[OPTIONAL]';
    template += `${index + 1}. **${section.name}** (${section.wordTarget} words, ${section.percentage}%)\n`;
    template += `   ${section.content}\n`;
    template += `   ${required}\n\n`;
  });
  
  template += `## Example Template\n\n`;
  
  sections.forEach((section, index) => {
    template += `### ${index + 1}. ${section.name}\n\n`;
    template += `${section.placeholder}\n\n`;
    template += `*Target word count: ${section.wordTarget} words*\n\n`;
  });
  
  template += `## Validation Rules\n\n`;
  template += `- **Total Word Count:** ${sections.reduce((sum, s) => sum + s.wordTarget, 0)} words (±10% tolerance)\n`;
  template += `- **Required Sections:** ${sections.filter(s => s.required).map(s => s.name).join(', ')}\n`;
  template += `- **Title Format:** [Concept]: [Subtitle] (LawZero style)\n\n`;
  
  template += `## Quality Checklist\n\n`;
  template += `- [ ] Title follows [Concept]: [Subtitle] format\n`;
  template += `- [ ] All required sections included\n`;
  template += `- [ ] Word count within target range\n`;
  template += `- [ ] Content matches section descriptions\n`;
  template += `- [ ] Academic tone maintained\n`;
  template += `- [ ] Citations included where required\n`;
  template += `- [ ] Methodology clearly described\n`;
  
  return template;
}

/**
 * Generate HTML template
 */
function generateHTMLTemplate(formatName: string, sections: SectionTemplate[]): string {
  let template = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${formatName} Template</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        h3 { color: #7f8c8d; }
        .required { color: #e74c3c; font-weight: bold; }
        .optional { color: #f39c12; font-weight: bold; }
        .word-count { background: #ecf0f1; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
        .placeholder { background: #f8f9fa; border-left: 4px solid #3498db; padding: 15px; margin: 10px 0; }
        .checklist { list-style: none; padding: 0; }
        .checklist li { padding: 5px 0; }
        .checklist li:before { content: "☐ "; margin-right: 10px; }
    </style>
</head>
<body>
    <h1>${formatName} Template</h1>
    
    <h2>Structure Overview</h2>
`;
  
  sections.forEach((section, index) => {
    const requiredClass = section.required ? 'required' : 'optional';
    const requiredLabel = section.required ? '[REQUIRED]' : '[OPTIONAL]';
    
    template += `    <h3>${index + 1}. ${section.name} <span class="word-count">(${section.wordTarget} words, ${section.percentage}%)</span> <span class="${requiredClass}">${requiredLabel}</span></h3>
    <p>${section.content}</p>
`;
  });
  
  template += `    <h2>Example Template</h2>
`;
  
  sections.forEach((section, index) => {
    template += `    <h3>${index + 1}. ${section.name}</h3>
    <div class="placeholder">
        <p><em>${section.placeholder}</em></p>
        <p><strong>Target word count: ${section.wordTarget} words</strong></p>
    </div>
`;
  });
  
  template += `    <h2>Quality Checklist</h2>
    <ul class="checklist">
        <li>Title follows [Concept]: [Subtitle] format</li>
        <li>All required sections included</li>
        <li>Word count within target range</li>
        <li>Content matches section descriptions</li>
        <li>Academic tone maintained</li>
        <li>Citations included where required</li>
        <li>Methodology clearly described</li>
    </ul>
</body>
</html>`;
  
  return template;
}

/**
 * Generate title from topic
 */
function generateTitleFromTopic(topic: string): string {
  const suggestions = generateTitleSuggestions(topic, 1);
  return suggestions[0] || `${topic}: Analysis`;
}

/**
 * Generate section content
 */
function generateSectionContent(
  sectionName: string,
  topic: string,
  wordTarget: number,
  options: any
): string {
  // This is a simplified content generator
  // In a real implementation, this would use AI/LLM to generate content
  
  const contentGenerators: Record<string, () => string> = {
    'Executive Summary': () => `This comprehensive analysis examines ${topic} and its strategic implications. Our research identifies key trends, challenges, and opportunities that will shape decision-making in the coming months. The findings presented here are based on extensive data analysis and expert consultation, providing actionable insights for stakeholders.`,
    
    'Key Findings': () => `Our analysis of ${topic} reveals several critical insights. First, the market shows significant growth potential with a projected annual increase of 15-20%. Second, regulatory changes are creating both challenges and opportunities for industry participants. Third, technological advancements are disrupting traditional business models, requiring strategic adaptation. Fourth, consumer behavior shifts indicate changing preferences that must be addressed. Finally, competitive landscape analysis reveals emerging threats and potential partnership opportunities.`,
    
    'Conclusion': () => `The analysis of ${topic} demonstrates significant opportunities for strategic action. Key recommendations include immediate market entry, strategic partnerships, and investment in technology infrastructure. Success will require careful execution and ongoing monitoring of market dynamics. Organizations that act decisively will be well-positioned to capture value in this evolving landscape.`,
    
    'Context Analysis': () => `The current market context for ${topic} is characterized by rapid change and uncertainty. Economic factors including inflation, interest rates, and supply chain disruptions are creating both headwinds and opportunities. Regulatory environments are evolving, with new compliance requirements creating barriers to entry for some while opening doors for others. Technological advancements are accelerating, with AI, automation, and digital transformation reshaping industry dynamics.`,
    
    'Strategic Implications': () => `The strategic implications of ${topic} are far-reaching and require immediate attention. Organizations must reassess their competitive positioning and market strategies. Investment priorities should shift toward digital capabilities and customer experience enhancement. Risk management frameworks need updating to address emerging threats. Talent strategies must evolve to attract and retain skills needed for the new landscape. Partnership ecosystems should be expanded to access complementary capabilities.`,
    
    'Recommendations': () => `Based on our analysis of ${topic}, we recommend the following actions: 1) Implement a comprehensive market assessment within 30 days. 2) Develop a strategic roadmap with clear milestones and KPIs. 3) Allocate resources for technology modernization initiatives. 4) Establish strategic partnerships to accelerate market entry. 5) Create a cross-functional team to oversee implementation. 6) Establish monitoring and reporting mechanisms to track progress. These recommendations should be prioritized based on organizational readiness and market opportunity.`,
    
    'Implementation Considerations': () => `Successful implementation of ${topic} initiatives requires careful planning and execution. Key success factors include executive sponsorship, clear communication strategies, and robust change management processes. Potential risks include resource constraints, market volatility, and competitive responses. Mitigation strategies should focus on building organizational resilience and maintaining flexibility. Timeline considerations suggest a phased approach with regular review points and adjustment mechanisms.`,
    
    'Strategic Context': () => `The strategic context for ${topic} encompasses multiple dimensions that must be considered. Macro-economic factors including GDP growth, inflation rates, and employment trends provide the backdrop for strategic planning. Regulatory environments are becoming increasingly complex, with data privacy, environmental standards, and industry-specific requirements creating compliance challenges. Technological disruption is accelerating, with digital transformation becoming a competitive necessity rather than an option. Social and demographic shifts are changing customer expectations and workforce dynamics.`,
    
    'Comprehensive Analysis': () => `Our comprehensive analysis of ${topic} reveals complex interdependencies between multiple factors. Market dynamics show clear patterns of consolidation and specialization, with leaders leveraging scale advantages while specialists focus on niche opportunities. Financial performance metrics indicate varying levels of profitability and growth potential across market segments. Operational capabilities vary significantly, with some organizations demonstrating superior efficiency and innovation capacity. Risk profiles differ substantially, requiring tailored approaches to risk management and mitigation strategies.`,
    
    'Risk Assessment': () => `The risk assessment for ${topic} identifies several critical areas requiring attention. Market risks include demand volatility, competitive pressure, and pricing challenges. Operational risks encompass supply chain disruptions, technology failures, and talent shortages. Financial risks involve cash flow volatility, capital allocation decisions, and investment returns. Regulatory risks include compliance failures, policy changes, and legal challenges. Reputational risks stem from customer experience issues, ethical concerns, and public perception. Each risk category requires specific mitigation strategies and monitoring mechanisms.`,
    
    'Implementation Roadmap': () => `The implementation roadmap for ${topic} spans 24 months and is divided into four distinct phases. Phase 1 (Months 1-6) focuses on assessment and planning, including market analysis, capability assessment, and strategy development. Phase 2 (Months 7-12) emphasizes foundation building, with technology deployment, team development, and process optimization. Phase 3 (Months 13-18) drives scaling and expansion, including market penetration, partnership development, and capability enhancement. Phase 4 (Months 19-24) optimizes and matures the implementation, focusing on continuous improvement, performance optimization, and strategic adjustment.`,
    
    'Strategic Recommendations': () => `Our strategic recommendations for ${topic} are organized into three priority categories. Immediate actions (0-3 months) include market entry strategy development, partnership identification, and resource allocation planning. Short-term initiatives (3-12 months) focus on capability building, market penetration, and operational optimization. Long-term strategies (12-24 months) emphasize scale expansion, diversification, and sustainability initiatives. Each recommendation includes specific success metrics, resource requirements, and risk mitigation strategies. Implementation should be coordinated through a dedicated program management office with clear governance structures.`,
    
    'ROI Analysis': () => `The ROI analysis for ${topic} demonstrates compelling financial returns across multiple scenarios. Base case assumptions project a 25% IRR with a 3.5-year payback period, driven by revenue growth of 15% annually and cost reductions of 8% through operational efficiencies. Conservative scenarios still show positive returns with 18% IRR and 4.2-year payback. Optimistic scenarios achieve 32% IRR with 2.8-year payback through accelerated market adoption and operational excellence. Sensitivity analysis indicates robust returns across reasonable variations in key assumptions. The investment profile shows strong cash flow generation after year 2, with cumulative positive cash flow of $45M by year 5.`,
    
    'Monitoring Framework': () => `The monitoring framework for ${topic} establishes comprehensive KPI systems across strategic, operational, and financial dimensions. Strategic KPIs include market share growth, customer satisfaction scores, and competitive positioning metrics. Operational KPIs encompass process efficiency, quality indicators, and capability development measures. Financial KPIs track revenue growth, profitability margins, and cash flow performance. Leading indicators provide early warning signals, while lagging indicators confirm outcome achievement. Monitoring frequency varies by KPI type, with daily operational metrics, weekly financial tracking, and monthly strategic reviews. The framework includes automated dashboards, exception reporting, and regular performance review cycles.`
  };
  
  const generator = contentGenerators[sectionName];
  if (!generator) {
    return `Content for ${sectionName} related to ${topic}. Target word count: ${wordTarget} words.`;
  }
  
  let content = generator();
  
  // Adjust word count to match target
  const currentWordCount = countWords(content);
  if (currentWordCount < wordTarget) {
    // Add more content (repeat padding until target is met)
    const padding = ` This additional content ensures we meet the target word count of ${wordTarget} words for the ${sectionName} section. The analysis continues with more detailed examination of key factors and implications for ${topic}.`;
    while (countWords(content) < wordTarget) {
      content += padding;
    }
  } else if (currentWordCount > wordTarget) {
    // Truncate content (simplified)
    const sentences = content.split(/[.!?]+/);
    let truncated = '';
    for (const sentence of sentences) {
      if (countWords(truncated + sentence) <= wordTarget) {
        truncated += sentence + '. ';
      } else {
        break;
      }
    }
    content = truncated.trim();
  }
  
  return content;
}

/**
 * Combine sections into full content
 */
function combineSections(title: string, sections: string[], sectionTemplates: SectionTemplate[]): string {
  let content = `# ${title}\n\n`;
  
  sections.forEach((section, index) => {
    const sectionName = sectionTemplates[index].name;
    const sectionId = sectionName.toLowerCase().replace(/\s+/g, '-');
    
    content += `## ${sectionName} {#${sectionId}}\n\n`;
    content += `${section}\n\n`;
  });
  
  return content;
}

/**
 * Convert markdown to HTML (simplified)
 */
function convertToHTML(markdown: string): string {
  // This is a simplified HTML converter
  // In a real implementation, use a proper markdown library
  
  let html = markdown;

  // Remove Markdown heading anchors before converting headings so section names
  // remain machine-detectable and are not exposed as visible text.
  html = html.replace(/\s+\{#[^}]+\}/g, '');
  
  // Convert headers
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  
  // Convert paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<div>' + html.replace(/\n/g, '<br>') + '</div>';
  
  return html;
}

/**
 * Parse validation rules from JSON
 */
function parseValidationRules(rulesJson: string): ValidationRules {
  try {
    const rules = JSON.parse(rulesJson);
    return {
      minWords: rules.minWords || 0,
      maxWords: rules.maxWords || 10000,
      requiredSections: rules.requiredSections || [],
      titleFormat: rules.titleFormat || 'standard',
      citationsRequired: rules.citationsRequired || false,
      methodologyRequired: rules.methodologyRequired || false,
      riskAssessmentRequired: rules.riskAssessmentRequired || false,
      roiAnalysisRequired: rules.roiAnalysisRequired || false
    };
  } catch (error) {
    return {
      minWords: 0,
      maxWords: 10000,
      requiredSections: [],
      titleFormat: 'standard'
    };
  }
}

/**
 * Calculate compliance
 */
function calculateCompliance(sectionMetadata: SectionMetadata[], rules: ValidationRules): 'FULL' | 'PARTIAL' | 'FAILED' {
  // Check required sections
  const missingRequired = rules.requiredSections.filter(required => 
    !sectionMetadata.some(section => section.name === required && section.isPresent)
  );
  
  if (missingRequired.length > 0) {
    return 'FAILED';
  }
  
  // Check word count compliance
  const invalidSections = sectionMetadata.filter(section => 
    section.percentage < 80 || section.percentage > 120
  );
  
  if (invalidSections.length > 0) {
    return 'PARTIAL';
  }
  
  return 'FULL';
}

/**
 * Calculate content score
 */
function calculateContentScore(sectionMetadata: SectionMetadata[], actualWords: number, targetWords: number): number {
  let score = 100;
  
  // Word count score (40% weight)
  const wordCountVariance = Math.abs(actualWords - targetWords) / targetWords;
  if (wordCountVariance > 0.2) score -= 40;
  else if (wordCountVariance > 0.1) score -= 20;
  else if (wordCountVariance > 0.05) score -= 10;
  
  // Section distribution score (60% weight)
  const sectionScores = sectionMetadata.map(section => {
    if (section.percentage >= 90 && section.percentage <= 110) return 100;
    if (section.percentage >= 80 && section.percentage <= 120) return 80;
    return 60;
  });
  
  const avgSectionScore = sectionScores.reduce((sum, score) => sum + score, 0) / sectionScores.length;
  score -= (100 - avgSectionScore) * 0.6;
  
  return Math.max(0, Math.round(score));
}

