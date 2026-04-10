# NOMOSX NEWSLETTER TEMPLATES
Generated: 2026-02-27T10:40:00.000Z

## Newsletter Structure
Based on the new format system, newsletter content should be tiered:

### FREE Tier Newsletter
- **Format:** Title + 1-sentence hook + blurred teaser + upgrade CTA
- **Length:** ~50 mots per brief
- **Style:** Abstrakt-style teasing
- **CTA:** "Unlock full brief →"

### ANALYST Tier Newsletter  
- **Format:** Title + full summary (150 mots) + "Read full brief →" link
- **Length:** ~200 mots per brief
- **Style:** Summary complet, accès direct
- **CTA:** "Read full brief →"

### RESEARCHER Tier Newsletter
- **Format:** Title + full summary + trust score + source count + direct link
- **Length:** ~250 mots per brief
- **Style:** Premium complet, métriques de confiance
- **CTA:** Direct link to publication

## Template Examples

### FREE Tier Template
```html
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td>
      <h2 style="font-size:17px;font-weight:400;color:#f4f4f5;">
        [Concept]: [Subtitle]
      </h2>
      <p style="font-size:14px;color:#71717a;">
        [1-sentence hook from Key Findings]...
      </p>
      <div style="position:relative;overflow:hidden;border-radius:6px;">
        <p style="font-size:13px;color:#52525b;filter:blur(3px);">
          [Blurred content from Key Findings]...
        </p>
      </div>
      <a href="[publication-url]" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;padding:10px 22px;border-radius:7px;">
        Unlock full brief →
      </a>
    </td>
  </tr>
</table>
```

### ANALYST Tier Template
```html
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td>
      <h2 style="font-size:17px;font-weight:400;color:#f4f4f5;">
        [Concept]: [Subtitle]
      </h2>
      <p style="font-size:14px;color:#a1a1aa;">
        [Full summary from Key Findings section, ~150 words]
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:20px;">
            <span style="font-size:12px;color:#52525b;">[source-count] sources</span>
          </td>
          <td>
            <a href="[publication-url]" style="font-size:13px;color:#818cf8;text-decoration:none;font-weight:500;">
              Read full brief →
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

### RESEARCHER Tier Template
```html
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="font-size:10px;font-weight:700;letter-spacing:0.18em;color:#6366f1;text-transform:uppercase;">
              Brief [index] of [total]
            </p>
          </td>
          <td align="right">
            <span style="font-size:11px;font-weight:600;color:[trust-color];background:[trust-color]18;border:1px solid [trust-color]40;padding:3px 10px;border-radius:20px;">
              Trust [trust-score]/100
            </span>
          </td>
        </tr>
      </table>
      <h2 style="font-size:17px;font-weight:400;color:#f4f4f5;">
        [Concept]: [Subtitle]
      </h2>
      <p style="font-size:14px;color:#a1a1aa;">
        [Full summary from Key Findings section, ~200 words]
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:20px;">
            <span style="font-size:12px;color:#52525b;">[source-count] peer-reviewed sources</span>
          </td>
          <td>
            <a href="[publication-url]" style="font-size:13px;color:#818cf8;text-decoration:none;font-weight:500;">
              Read full brief →
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

## Implementation Guide

### Update Weekly Newsletter Job
Modify `lib/jobs/weekly-newsletter.ts` to use new format structure:

1. **Title Standardization**: Ensure all titles follow `[Concept]: [Subtitle]` format
2. **Content Extraction**: Extract content from appropriate sections based on tier
3. **Word Count Validation**: Ensure content respects word limits per tier
4. **Trust Score Integration**: Add trust scores for RESEARCHER tier

### Content Mapping
- **FREE**: Extract 1-sentence hook from Key Findings section
- **ANALYST**: Extract full Key Findings summary (~150 words)
- **RESEARCHER**: Extract full Key Findings summary + trust score + source count

### Template Variables
- `[Concept]: [Subtitle]` - Standardized title format
- `[publication-url]` - Link to publication page
- `[source-count]` - Number of sources in publication
- `[trust-score]` - Trust score (0-100)
- `[trust-color]` - Color based on trust score (green/amber/blue)
- `[index]` - Brief number in newsletter
- `[total]` - Total briefs in newsletter

### Quality Checklist
- [ ] All titles follow [Concept]: [Subtitle] format
- [ ] Content extracted from correct sections
- [ ] Word counts respected per tier
- [ ] Trust scores displayed for RESEARCHER tier
- [ ] Source counts accurate
- [ ] Links functional
- [ ] Visual hierarchy maintained
- [ ] Mobile-responsive design
