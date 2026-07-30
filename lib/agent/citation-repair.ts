/**
 * Deterministic Citation Repair — post-render HTML cleanup.
 *
 * Problem: The LLM analyst generates numbers without [SRC-N] citations,
 * and the editor render can drop [SRC-N] tags. This produces:
 * - 71 unsourced numbers → numerical gate violations
 * - NLI integrity 40% → claims don't match sources
 * - Grounding veto → trust score capped at 40
 *
 * Solution (deterministic, no LLM — Invariant 5):
 * 1. CITATION BACKFILL: Scan analyst JSON for [SRC-N] tags that are missing
 *    from the rendered HTML and inject them at the matching claim location.
 * 2. NUMBER SANITIZATION: Scan HTML for statistical numbers (%, $B, ratios)
 *    without [SRC-N] within 100 chars and replace with "non établie".
 * 3. CITATION INJECTION: For paragraphs that mention a source title/author
 *    but lack [SRC-N], inject the matching citation tag.
 *
 * This is code, not LLM. It runs after the editor render and before the
 * critical loop. It cannot add new claims — only repair missing citations
 * or neutralize unsourced numbers.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CitationRepairResult {
  html: string;
  citationsInjected: number;
  numbersSanitized: number;
  citationsBackfilled: number;
  details: string[];
}

// ─── 1. CITATION BACKFILL ───────────────────────────────────────────────────
/**
 * The analyst JSON contains [SRC-N] tags in text fields (verdict, causalChain,
 * keyFindings, etc.) but the editor render may drop them when converting to HTML.
 * This function extracts [SRC-N] from the analyst JSON and checks if they
 * appear in the HTML. If missing, it tries to inject them near matching text.
 */
export function backfillCitationsFromAnalysis(
  html: string,
  analysis: Record<string, unknown>,
  sourceCount: number,
): { html: string; injected: number; details: string[] } {
  let injected = 0;
  const details: string[] = [];

  // Extract all [SRC-N] from analysis JSON text fields
  const analysisText = JSON.stringify(analysis);
  const analysisCitations = new Set<string>();
  for (const m of analysisText.matchAll(/\[SRC-(\d+)\]/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= sourceCount) {
      analysisCitations.add(`[SRC-${n}]`);
    }
  }

  // Check which citations are present in HTML
  const htmlCitations = new Set<string>();
  for (const m of html.matchAll(/\[SRC-(\d+)\]/g)) {
    htmlCitations.add(`[SRC-${m[1]}]`);
  }

  const missing = [...analysisCitations].filter(c => !htmlCitations.has(c));
  if (missing.length === 0) {
    return { html, injected: 0, details };
  }

  // Try to inject missing citations by finding text snippets from the analysis
  // that contain the missing [SRC-N] and matching them to the HTML
  const textFields = ['verdict', 'summary', 'consensus', 'evidence', 'implications',
    'risks', 'open_questions', 'what_changes_mind', 'anchoringBasis', 'throughLine'];

  for (const field of textFields) {
    const val = analysis[field];
    if (typeof val !== 'string') continue;

    // Find sentences with missing citations
    const sentences = val.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const srcInSentence = [...sentence.matchAll(/\[SRC-(\d+)\]/g)].map(m => `[SRC-${m[1]}]`);
      const missingHere = srcInSentence.filter(s => missing.includes(s));
      if (missingHere.length === 0) continue;

      // Extract a searchable snippet (first 40-60 chars without [SRC-N])
      const cleanSnippet = sentence.replace(/\[SRC-\d+\]/g, '').trim().slice(0, 50);
      if (cleanSnippet.length < 15) continue;

      // Search for this snippet in the HTML (strip tags for matching)
      const htmlText = html.replace(/<[^>]+>/g, ' ');
      const idx = htmlText.indexOf(cleanSnippet.slice(0, 30));
      if (idx >= 0) {
        // Find the position in the actual HTML (approximate)
        // Insert the missing citation at the end of the matched text
        const afterIdx = idx + cleanSnippet.length;
        // Find the next </p> or end of text after this position
        const htmlAfter = html.slice(afterIdx);
        const closeTagIdx = htmlAfter.search(/<\/p>|<br\s*\/?>|<\/li>/i);
        if (closeTagIdx >= 0) {
          const insertPos = afterIdx + closeTagIdx;
          const citations = missingHere.join('');
          html = html.slice(0, insertPos) + ' ' + citations + html.slice(insertPos);
          injected += missingHere.length;
          details.push(`Backfilled ${missingHere.join(', ')} near "${cleanSnippet.slice(0, 30)}..."`);
          // Remove from missing list
          for (const c of missingHere) {
            const i = missing.indexOf(c);
            if (i >= 0) missing.splice(i, 1);
          }
        }
      }
    }
  }

  return { html, injected, details };
}

// ─── 2. NUMBER SANITIZATION ─────────────────────────────────────────────────
/**
 * Scan HTML for statistical numbers without [SRC-N] within 100 chars.
 * Replace unsourced numbers with "non établie" (Invariant 6).
 *
 * This is deterministic — no LLM. It prevents the analyst's hallucinated
 * numbers from reaching the reader.
 */
export function sanitizeUnsourcedNumbers(html: string): { html: string; sanitized: number; details: string[] } {
  const details: string[] = [];
  let sanitized = 0;

  // Work on the text content, preserving HTML tags
  // Pattern: numbers that look like statistics
  const statPattern = /(\d+\.?\d*\s*%|\$\s?\d+\.?\d*\s*[BbMmKk]|\b\d+\.\d{2,}\b|\b[1-9]\d{3,}\b)/g;

  // We need to check in the text content (between tags)
  // Split HTML into tag and text segments
  const segments: { type: 'tag' | 'text'; content: string }[] = [];
  let lastIdx = 0;
  for (const m of html.matchAll(/<[^>]+>/g)) {
    if (m.index! > lastIdx) {
      segments.push({ type: 'text', content: html.slice(lastIdx, m.index!) });
    }
    segments.push({ type: 'tag', content: m[0] });
    lastIdx = m.index! + m[0].length;
  }
  if (lastIdx < html.length) {
    segments.push({ type: 'text', content: html.slice(lastIdx) });
  }

  // Process text segments
  const repairedSegments = segments.map(seg => {
    if (seg.type === 'tag') return seg.content;

    let text = seg.content;
    // Skip the sources section (SRC-N entries themselves)
    // We only repair body text, not the source list

    text = text.replace(statPattern, (match, offset) => {
      // Check for [SRC-N] within 100 chars after the number
      const after = text.slice(offset + match.length, offset + match.length + 100);
      // Also check 50 chars before (citation may precede the number)
      const before = text.slice(Math.max(0, offset - 50), offset);

      if (/\[(?:SRC|E)-\d+\]/.test(after) || /\[(?:SRC|E)-\d+\]/.test(before)) {
        return match; // Citation present, keep the number
      }

      // Don't sanitize years (1900-2099) or source list numbers
      const yearMatch = match.match(/^\b(19\d{2}|20\d{2})\b$/);
      if (yearMatch) return match; // It's a year, not a statistic

      // Don't sanitize SRC-N or E-N numbers themselves
      if (/\[(?:SRC|E)-\d+/.test(text.slice(Math.max(0, offset - 10), offset + match.length + 10))) {
        return match;
      }

      sanitized++;
      details.push(`Sanitized unsourced number: "${match}"`);
      return 'non établie';
    });

    return text;
  });

  return {
    html: repairedSegments.join(''),
    sanitized,
    details,
  };
}

// ─── 3. CITATION INJECTION BY SOURCE MATCHING ───────────────────────────────
/**
 * For paragraphs that mention a source by title or author but lack [SRC-N],
 * inject the matching citation tag. This helps when the editor renders
 * source references as text but drops the [SRC-N] tag.
 */
export function injectCitationsBySourceMatch(
  html: string,
  sources: { title: string; authors?: { author?: { name?: string } }[]; provider?: string }[],
): { html: string; injected: number; details: string[] } {
  const details: string[] = [];
  let injected = 0;

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const srcTag = `[SRC-${i + 1}]`;

    // Check if this source is already cited
    if (html.includes(srcTag)) continue;

    // Build search patterns from source metadata
    const patterns: string[] = [];
    if (src.title) {
      // Use first 30 chars of title as a search pattern
      const titleSnippet = src.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 30);
      if (titleSnippet.length > 10) patterns.push(titleSnippet);
    }
    // Check author names
    const authorNames = src.authors?.map(a => a.author?.name).filter(Boolean) as string[] || [];
    for (const name of authorNames.slice(0, 2)) {
      const lastName = name.split(' ').slice(-1)[0];
      if (lastName && lastName.length > 3) {
        patterns.push(lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }
    }

    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'i');
      const match = regex.exec(html);
      if (match && match.index !== undefined) {
        // Check if there's already a [SRC-N] within 200 chars
        const context = html.slice(Math.max(0, match.index - 100), match.index + pattern.length + 100);
        if (/\[SRC-\d+\]/.test(context)) continue; // Already cited nearby

        // Find the end of the current sentence or paragraph
        const afterMatch = html.slice(match.index + pattern.length);
        const endIdx = afterMatch.search(/[.!?</]/);
        if (endIdx >= 0 && endIdx < 200) {
          const insertPos = match.index + pattern.length + endIdx;
          html = html.slice(0, insertPos) + ' ' + srcTag + html.slice(insertPos);
          injected++;
          details.push(`Injected ${srcTag} near "${pattern}"`);
          break; // One injection per source
        }
      }
    }
  }

  return { html, injected, details };
}

// ─── MAIN ENTRY POINT ───────────────────────────────────────────────────────

export function repairCitations(
  html: string,
  analysis: Record<string, unknown>,
  sources: { title: string; authors?: { author?: { name?: string } }[]; provider?: string }[],
): CitationRepairResult {
  const allDetails: string[] = [];
  let workingHtml = html;
  let totalInjected = 0;
  let totalSanitized = 0;
  let totalBackfilled = 0;

  // Step 1: Backfill citations from analyst JSON
  const backfill = backfillCitationsFromAnalysis(workingHtml, analysis, sources.length);
  workingHtml = backfill.html;
  totalBackfilled = backfill.injected;
  allDetails.push(...backfill.details);

  // Step 2: Inject citations by source matching
  const injection = injectCitationsBySourceMatch(workingHtml, sources);
  workingHtml = injection.html;
  totalInjected = injection.injected;
  allDetails.push(...injection.details);

  // Step 3: Sanitize unsourced numbers (must run AFTER injection)
  const sanitization = sanitizeUnsourcedNumbers(workingHtml);
  workingHtml = sanitization.html;
  totalSanitized = sanitization.sanitized;
  allDetails.push(...sanitization.details);

  const total = totalBackfilled + totalInjected + totalSanitized;
  console.log(`[CITATION REPAIR] Backfilled: ${totalBackfilled}, Injected: ${totalInjected}, Sanitized: ${totalSanitized} (total: ${total})`);

  return {
    html: workingHtml,
    citationsInjected: totalInjected,
    numbersSanitized: totalSanitized,
    citationsBackfilled: totalBackfilled,
    details: allDetails.slice(0, 20), // Cap details to avoid huge logs
  };
}
