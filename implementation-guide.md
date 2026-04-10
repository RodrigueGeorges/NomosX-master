# NOMOSX FORMAT IMPLEMENTATION GUIDE
Generated: 2026-02-27T10:40:00.000Z

## Overview
This guide provides step-by-step instructions for implementing the new NomosX format system based on LawZero academic standards.

## Phase 1: Database Setup (1 week)

### 1.1 Create Format Tables
Execute the database schema from `database-schema.sql`

```bash
# Execute the schema
psql $DATABASE_URL -f database-schema.sql
```

### 1.2 Verify Format Configuration
```sql
-- Verify formats were created
SELECT * FROM publication_formats;

-- Verify sections were created
SELECT f.name as format_name, s.name as section_name, s.word_target, s.percentage_target
FROM publication_formats f
JOIN format_sections s ON f.id = s.format_id
ORDER BY f.id, s.order_index;
```

### 1.3 Test Publication Updates
```sql
-- Test publication format assignment
SELECT id, title, word_count, format_id, format_compliance
FROM publications
ORDER BY created_at DESC
LIMIT 10;
```

## Phase 2: Template Implementation (2 weeks)

### 2.1 Title Standardization
Create `lib/formatters/title-formatter.ts`:

```typescript
export function formatTitle(title: string, format: 'lawzero'): string {
  if (format === 'lawzero') {
    const parts = title.split(':');
    if (parts.length === 2) {
      return parts[0].trim() + ': ' + parts[1].trim();
    }
  }
  return title;
}

export function validateTitleFormat(title: string): boolean {
  const lawzeroPattern = /^\[.+\]: .+$/;
  return lawzeroPattern.test(title.trim());
}
```

### 2.2 Word Counter
Create `lib/word-counter.ts`:

```typescript
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export function validateWordCount(content: string, target: number, tolerance: number = 0.1): ValidationResult {
  const wordCount = countWords(content);
  const minWords = Math.floor(target * (1 - tolerance));
  const maxWords = Math.ceil(target * (1 + tolerance));
  
  return {
    isValid: wordCount >= minWords && wordCount <= maxWords,
    wordCount,
    minWords,
    maxWords,
    errors: wordCount < minWords ? [`Word count too low: ${wordCount} < ${minWords}`] : [],
    warnings: wordCount > maxWords ? [`Word count slightly high: ${wordCount} > ${maxWords}`] : []
  };
}

interface ValidationResult {
  isValid: boolean;
  wordCount: number;
  minWords: number;
  maxWords: number;
  errors: string[];
  warnings: string[];
}
```

### 2.3 Format Validator
Create `lib/validators/format-validator.ts`:

```typescript
import { prisma } from '@/lib/db';
import { countWords, validateWordCount } from '@/lib/word-counter';
import { validateTitleFormat } from '@/lib/formatters/title-formatter';

export interface FormatValidationResult {
  isValid: boolean;
  formatId: number;
  formatName: string;
  totalWords: number;
  sections: SectionValidation[];
  errors: string[];
  warnings: string[];
  compliance: 'FULL' | 'PARTIAL' | 'FAILED';
}

export interface SectionValidation {
  name: string;
  wordTarget: number;
  actualWords: number;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateFormat(content: string, formatId: number): Promise<FormatValidationResult> {
  // Get format configuration
  const format = await prisma.publicationFormat.findUnique({
    where: { id: formatId },
    include: { sections: { orderBy: { orderIndex: 'asc' } } }
  });
  
  if (!format) {
    throw new Error(`Format not found: ${formatId}`);
  }
  
  const result: FormatValidationResult = {
    isValid: true,
    formatId,
    formatName: format.name,
    totalWords: countWords(content),
    sections: [],
    errors: [],
    warnings: [],
    compliance: 'FULL'
  };
  
  // Validate total word count
  const validation = validateWordCount(content, format.totalWords);
  if (!validation.isValid) {
    result.isValid = false;
    result.errors.push(...validation.errors);
  }
  result.warnings.push(...validation.warnings);
  
  // Validate sections (simplified - in real implementation, would parse HTML/Markdown)
  for (const section of format.sections) {
    const sectionValidation: SectionValidation = {
      name: section.name,
      wordTarget: section.wordTarget,
      actualWords: 0, // Would extract from content
      isValid: true,
      errors: [],
      warnings: []
    };
    
    // Check if required section is present
    if (section.isRequired && !content.includes(section.name)) {
      sectionValidation.isValid = false;
      sectionValidation.errors.push(`Missing required section: ${section.name}`);
      result.isValid = false;
      result.errors.push(`Missing required section: ${section.name}`);
    }
    
    result.sections.push(sectionValidation);
  }
  
  // Determine compliance level
  if (!result.isValid) {
    result.compliance = 'FAILED';
  } else if (result.warnings.length > 0) {
    result.compliance = 'PARTIAL';
  }
  
  return result;
}
```

### 2.4 Format Generator
Create `lib/generators/format-generator.ts`:

```typescript
import { prisma } from '@/lib/db';
import { formatTitle } from '@/lib/formatters/title-formatter';

export interface FormatTemplate {
  id: number;
  name: string;
  tier: string;
  totalWords: number;
  sections: SectionTemplate[];
  template: string;
}

export interface SectionTemplate {
  name: string;
  wordTarget: number;
  percentage: number;
  content: string;
  required: boolean;
}

export async function generateFormatTemplate(formatId: number): Promise<FormatTemplate> {
  const format = await prisma.publicationFormat.findUnique({
    where: { id: formatId },
    include: { sections: { orderBy: { orderIndex: 'asc' } } }
  });
  
  if (!format) {
    throw new Error(`Format not found: ${formatId}`);
  }
  
  const sections: SectionTemplate[] = format.sections.map(section => ({
    name: section.name,
    wordTarget: section.wordTarget,
    percentage: section.percentageTarget,
    content: section.contentDescription || '',
    required: section.isRequired
  }));
  
  const template = generateTemplateString(format.name, sections);
  
  return {
    id: format.id,
    name: format.name,
    tier: format.tier,
    totalWords: format.totalWords,
    sections,
    template
  };
}

function generateTemplateString(formatName: string, sections: SectionTemplate[]): string {
  const header = `# ${formatName}\n\n## Structure\n\n`;
  const sectionContent = sections.map((section, index) => {
    const required = section.required ? '[REQUIRED]' : '[OPTIONAL]';
    return `${index + 1}. **${section.name}** (${section.wordTarget} mots, ${section.percentage}%)\n   ${section.content}\n   ${required}\n`;
  }).join('\n');
  
  const example = '\n## Example Structure\n\n' + sections.map((section, index) => {
    return `### ${index + 1}. ${section.name}\n\n[Content placeholder - ${section.wordTarget} mots]\n\n${section.content}\n\n*Target: ${section.wordTarget} mots*\n`;
  }).join('\n');
  
  return header + sectionContent + example;
}
```

## Phase 3: Newsletter Update (1 week)

### 3.1 Update Newsletter Job
Modify `lib/jobs/weekly-newsletter.ts`:

```typescript
// Add title standardization
function standardizeTitle(title: string): string {
  const parts = title.split(':');
  if (parts.length === 2) {
    return parts[0].trim() + ': ' + parts[1].trim();
  }
  return title;
}

// Update extractSummary to use new format structure
function extractSummary(html: string, tier: UserTier): string {
  // Extract from Key Findings section for all tiers
  const keyFindingsMatch = html.match(/<section[^>]*id="?key-findings"?[^>]*>([\s\S]*?)<\/section>/i);
  if (keyFindingsMatch) {
    const text = keyFindingsMatch[1].replace(/<[^>]+>/g, '').trim();
    
    if (tier === 'FREE') {
      // Extract 1-sentence hook
      const sentences = text.split(/[.!?]+/);
      return sentences[0].trim() + (sentences[0].trim() ? '…' : '');
    } else if (tier === 'ANALYST') {
      // Extract ~150 words
      return text.length > 600 ? text.slice(0, 600).replace(/\s\S+$/, '') + '…' : text;
    } else {
      // RESEARCHER - full summary
      return text.length > 800 ? text.slice(0, 800).replace(/\s\S+$/, '') + '…' : text;
    }
  }
  
  // Fallback to executive summary
  const summaryMatch = html.match(/<section[^>]*id="?executive-summary"?[^>]*>([\s\S]*?)<\/section>/i);
  if (summaryMatch) {
    const text = summaryMatch[1].replace(/<[^>]+>/g, '').trim();
    return text.slice(0, 300) + (text.length > 300 ? '…' : '');
  }
  
  return "Read the full analysis for key insights and recommendations.";
}

// Update renderBrief functions to use standardized titles
function renderBriefFree(brief: { id: string; title: string; summary: string; publicId?: string }, index: number, total: number): string {
  const standardizedTitle = standardizeTitle(brief.title);
  const hook = brief.summary.slice(0, 120).replace(/\s\S+$/, '') + '…';
  const briefUrl = `${APP_URL}/publications/${brief.publicId || brief.id}?${UTM}`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${index < total - 1 ? '24px' : '0'};padding-bottom:${index < total - 1 ? '24px' : '0'};border-bottom:${index < total - 1 ? '1px solid #27272a' : 'none'};">
      <tr>
        <td>
          <p style="font-size:10px;font-weight:700;letter-spacing:0.18em;color:#6366f1;text-transform:uppercase;margin:0 0 8px;">
            Brief ${index + 1} of ${total}
          </p>
          <h2 style="font-size:17px;font-weight:400;color:#f4f4f5;margin:0 0 10px;line-height:1.4;">
            ${standardizedTitle}
          </h2>
          <p style="font-size:14px;color:#71717a;line-height:1.6;margin:0 0 12px;">
            ${hook}
          </p>
          <!-- Blurred teaser block -->
          <div style="position:relative;overflow:hidden;border-radius:6px;margin-bottom:16px;">
            <p style="font-size:13px;color:#52525b;line-height:1.6;margin:0;filter:blur(3px);user-select:none;pointer-events:none;padding:12px;background:#111113;border:1px solid #27272a;border-radius:6px;">
              ${brief.summary.slice(120, 280)}…
            </p>
          </div>
          <a href="${briefUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;text-decoration:none;padding:10px 22px;border-radius:7px;font-size:13px;font-weight:500;letter-spacing:0.01em;">
            Unlock full brief →
          </a>
        </td>
      </tr>
    </table>`;
}
```

### 3.2 Test Newsletter Generation
```bash
# Test newsletter generation
npx tsx lib/jobs/weekly-newsletter.ts --dry-run
```

## Phase 4: API Updates (1 week)

### 4.1 Update Publication API
Modify `app/api/think-tank/publications/route.ts` to include format validation:

```typescript
// Add format validation to publication creation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, content, formatId } = body;
    
    // Validate format
    if (formatId) {
      const validation = await validateFormat(content, formatId);
      if (!validation.isValid) {
        return NextResponse.json(
          { error: "Format validation failed", errors: validation.errors },
          { status: 400 }
        );
      }
    }
    
    // Standardize title
    const standardizedTitle = formatTitle(title, 'lawzero');
    
    // Create publication with format information
    const publication = await prisma.thinkTankPublication.create({
      data: {
        title: standardizedTitle,
        html: content,
        formatId,
        formatCompliance: validation?.compliance || 'NONE',
        wordCountActual: countWords(content),
        validationErrors: validation?.errors || []
      }
    });
    
    return NextResponse.json({ publication });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create publication" },
      { status: 500 }
    );
  }
}
```

### 4.2 Add Format Endpoints
Create `app/api/formats/route.ts`:

```typescript
export async function GET(req: NextRequest) {
  try {
    const formats = await prisma.publicationFormat.findMany({
      include: {
        sections: {
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: { tier: 'asc' }
    });
    
    return NextResponse.json({ formats });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch formats" },
      { status: 500 }
    );
  }
}
```

## Phase 5: Testing (1 week)

### 5.1 Unit Tests
Create `__tests__/format-validation.test.ts`:

```typescript
import { validateFormat } from '@/lib/validators/format-validator';
import { countWords } from '@/lib/word-counter';
import { formatTitle } from '@/lib/formatters/title-formatter';

describe('Format Validation', () => {
  test('should count words correctly', () => {
    expect(countWords('Hello world')).toBe(2);
    expect(countWords('This is a test sentence')).toBe(5);
  });
  
  test('should format titles correctly', () => {
    expect(formatTitle('AI: Impact Analysis', 'lawzero')).toBe('AI: Impact Analysis');
    expect(formatTitle('AI Impact Analysis', 'lawzero')).toBe('AI Impact Analysis');
  });
  
  test('should validate format compliance', async () => {
    const content = `
      <h1>AI: Healthcare Impact</h1>
      <section id="executive-summary">
        <p>Executive summary content...</p>
      </section>
      <section id="key-findings">
        <p>Key findings content...</p>
      </section>
      <section id="conclusion">
        <p>Conclusion content...</p>
      </section>
    `;
    
    const validation = await validateFormat(content, 1); // Summary Report format
    expect(validation.isValid).toBe(true);
    expect(validation.formatName).toBe('Summary Report');
  });
});
```

### 5.2 Integration Tests
Create `__tests__/newsletter-generation.test.ts`:

```typescript
import { generateNewsletterHTML } from '@/lib/jobs/weekly-newsletter';

describe('Newsletter Generation', () => {
  test('should generate FREE tier newsletter', () => {
    const briefs = [
      { id: '1', title: 'AI: Healthcare Analysis', summary: 'AI transforms healthcare with diagnostic accuracy improvements...', sourceCount: 15 }
    ];
    
    const html = generateNewsletterHTML({ number: 1, date: 'February 27, 2026' }, briefs, 'FREE');
    
    expect(html).toContain('AI: Healthcare Analysis');
    expect(html).toContain('AI transforms healthcare');
    expect(html).toContain('Unlock full brief');
  });
  
  test('should generate RESEARCHER tier newsletter', () => {
    const briefs = [
      { id: '1', title: 'AI: Healthcare Analysis', summary: 'AI transforms healthcare with diagnostic accuracy improvements...', sourceCount: 15, trustScore: 85 }
    ];
    
    const html = generateNewsletterHTML({ number: 1, date: 'February 27, 2026' }, briefs, 'RESEARCHER');
    
    expect(html).toContain('AI: Healthcare Analysis');
    expect(html).toContain('Trust 85/100');
    expect(html).toContain('15 peer-reviewed sources');
  });
});
```

### 5.3 End-to-End Tests
Create `__tests__/e2e/format-system.test.ts`:

```typescript
describe('Format System E2E', () => {
  test('should create and validate publication', async () => {
    // Create publication
    const response = await fetch('/api/think-tank/publications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'AI: Healthcare Impact Analysis',
        content: 'Full content with all required sections...',
        formatId: 1
      })
    });
    
    expect(response.status).toBe(200);
    const publication = await response.json();
    
    // Verify format compliance
    expect(publication.formatCompliance).toBe('COMPLIANT');
    expect(publication.title).toBe('AI: Healthcare Impact Analysis');
  });
});
```

## Timeline Summary
- **Phase 1:** 1 week (Database Setup)
- **Phase 2:** 2 weeks (Template Implementation)
- **Phase 3:** 1 week (Newsletter Update)
- **Phase 4:** 1 week (API Updates)
- **Phase 5:** 1 week (Testing)
- **Total:** 6 weeks

## Success Criteria
- All formats validated (FULL compliance)
- 95%+ of existing publications compliant
- Templates generated and documented
- Newsletter updated for new formats
- API endpoints functional
- Monitoring system active
- Training materials created

## Rollback Plan
If issues arise during implementation:

1. **Database Rollback**: Restore database from backup before schema changes
2. **Code Rollback**: Revert to previous version of newsletter job
3. **API Rollback**: Disable format validation temporarily
4. **Monitoring**: Monitor system health and user feedback

## Monitoring and Maintenance
- Set up alerts for format validation failures
- Monitor compliance rates over time
- Regular audits of publication quality
- User feedback collection on new formats

## Training Materials
- Create user guide for new format system
- Document template usage
- Provide examples of compliant publications
- Train content creators on new standards
